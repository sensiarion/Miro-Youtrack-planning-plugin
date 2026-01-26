import { ref } from 'vue';
import { loadSyncState, saveSyncState, saveSettings, type SyncState } from '../storage';
import { searchIssues } from '../youtrack/client';
import { YouTrackIssue } from '../youtrack/types';
import { updateTaskShape, extractIssueUrlFromShape, getTaskColor, buildTaskMindmapContent } from '../miro/taskShape';
import { getOrCreateNotFoundFrame, expandFrameIfNeeded, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from '../miro/notFoundFrame';
import { METADATA_KEY, TASK_FILL_OPACITY, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT } from '../constants';

export function useSync() {
  const syncState = ref<SyncState>(loadSyncState());
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const syncedTasks = ref<YouTrackIssue[]>([]);

  async function syncTasks(
    syncQuery: string,
    getEffectiveSettings: () => { baseUrl: string; token: string; statusFieldName: string }
  ) {
    if (!syncQuery.trim()) {
      syncError.value = 'Please enter a sync query';
      return;
    }

    isSyncing.value = true;
    syncError.value = null;

    try {
      const { baseUrl, token, statusFieldName } = getEffectiveSettings();
      
      const issues = await searchIssues({
        baseUrl,
        token,
        query: syncQuery,
        statusFieldName,
      });

      // Build map by issue URL
      const issueMap = new Map<string, YouTrackIssue>();
      issues.forEach(issue => {
        issueMap.set(issue.url, issue);
      });

      // Get all mindmap nodes and shapes on board (for backward compatibility)
      const allMindmapNodes = await miro.board.experimental.get({ type: 'mindmap_node' });
      const allShapes = await miro.board.get({ type: 'shape' });
      const allItems = [...allMindmapNodes, ...allShapes];
      
      // Identify plugin-managed task shapes and build synced tasks list
      const taskShapes: Array<{ shape: any; issueUrl: string | null; issue: YouTrackIssue | null }> = [];
      const syncedTasksList: YouTrackIssue[] = [];
      
      for (const shape of allItems) {
        let issueUrl: string | null = null;
        let issue: YouTrackIssue | null = null;
        
        // Try metadata first (primary method)
        try {
          const metadata = await shape.getMetadata(METADATA_KEY);
          if (metadata?.issueUrl) {
            issueUrl = metadata.issueUrl;
            issue = issueMap.get(issueUrl) || null;
            taskShapes.push({ shape, issueUrl, issue });
            
            if (issue) {
              syncedTasksList.push(issue);
            } else {
              // If issue not found in sync query results, try to extract from shape content
              const content = shape.content || '';
              const idMatch = content.match(/<a[^>]*>([^<]+)<\/a>/);
              const summaryMatch = content.match(/<\/a>\s*([^(]+)/);
              if (idMatch && summaryMatch) {
                syncedTasksList.push({
                  idReadable: idMatch[1],
                  summary: summaryMatch[1].trim(),
                  tags: [],
                  assignee: 'Unassigned',
                  stateName: metadata.stateName || '',
                  stateNameLocalized: null,
                  url: issueUrl,
                });
              }
            }
            continue;
          }
        } catch (e) {
          // Metadata not found or error
        }
        
        // Fallback: parse from content (for shapes) or linkedTo (for mindmap nodes)
        if (shape.type === 'mindmap_node' && shape.linkedTo) {
          issueUrl = shape.linkedTo;
          issue = issueMap.get(issueUrl) || null;
          taskShapes.push({ shape, issueUrl, issue });
          
          if (issue) {
            syncedTasksList.push(issue);
          }
        } else {
          issueUrl = extractIssueUrlFromShape(shape.content || '');
          if (issueUrl) {
            issue = issueMap.get(issueUrl) || null;
            taskShapes.push({ shape, issueUrl, issue });
            
            if (issue) {
              syncedTasksList.push(issue);
            }
          }
        }
      }
      
      // Update synced tasks list
      syncedTasks.value = syncedTasksList;

      let updatedCount = 0;
      let createdCount = 0;

      // Update existing task shapes
      for (const { shape, issueUrl } of taskShapes) {
        if (!issueUrl) continue;
        
        const issue = issueMap.get(issueUrl);
        if (issue) {
          await updateTaskShape(shape, issue);
          updatedCount++;
          issueMap.delete(issueUrl);
        }
      }

      // Create missing issues in "Not found" frame
      if (issueMap.size > 0) {
        const notFoundFrame = await getOrCreateNotFoundFrame();
        
        // Spacing between cards (horizontal and vertical offset)
        // Use card dimensions + gap to prevent overlap
        const horizontalSpacing = TASK_SHAPE_WIDTH + 50; // Card width + 50px gap
        const verticalSpacing = TASK_SHAPE_HEIGHT + 50; // Card height + 50px gap
        const padding = 100;
        const itemsPerRow = 4;
        
        await expandFrameIfNeeded(notFoundFrame, issueMap.size, itemsPerRow, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT, horizontalSpacing);
        await notFoundFrame.sync();
        
        const frameWidth = notFoundFrame.width || DEFAULT_FRAME_WIDTH;
        const frameHeight = notFoundFrame.height || DEFAULT_FRAME_HEIGHT;
        
        // Calculate frame boundaries
        const frameLeft = notFoundFrame.x - frameWidth / 2;
        const frameTop = notFoundFrame.y - frameHeight / 2;
        const frameRight = notFoundFrame.x + frameWidth / 2;
        const frameBottom = notFoundFrame.y + frameHeight / 2;
        
        // Track positions of created cards to prevent overlap
        const createdPositions: Array<{ x: number; y: number; width: number; height: number }> = [];
        
        let index = 0;
        for (const issue of issueMap.values()) {
          const color = getTaskColor(issue.stateName);
          const content = buildTaskMindmapContent(issue);
          
          // Calculate grid position
          const row = Math.floor(index / itemsPerRow);
          const col = index % itemsPerRow;
          
          // Calculate base position relative to frame top-left
          // Position is center of card, so we need to account for card dimensions
          const baseRelX = padding + col * horizontalSpacing + TASK_SHAPE_WIDTH / 2;
          const baseRelY = padding + row * verticalSpacing + TASK_SHAPE_HEIGHT / 2;
          
          // Convert to absolute coordinates (center of card)
          let shapeX = frameLeft + baseRelX;
          let shapeY = frameTop + baseRelY;
          
          // Check for overlaps with previously created cards and adjust if needed
          const cardHalfWidth = TASK_SHAPE_WIDTH / 2;
          const cardHalfHeight = TASK_SHAPE_HEIGHT / 2;
          const minDistanceX = TASK_SHAPE_WIDTH + 50; // Minimum horizontal distance
          const minDistanceY = TASK_SHAPE_HEIGHT + 50; // Minimum vertical distance
          
          let adjustedX = shapeX;
          let adjustedY = shapeY;
          let hasOverlap = true;
          let attempts = 0;
          const maxAttempts = 50;
          
          // Find a non-overlapping position
          while (hasOverlap && attempts < maxAttempts) {
            hasOverlap = false;
            
            for (const pos of createdPositions) {
              const distanceX = Math.abs(adjustedX - pos.x);
              const distanceY = Math.abs(adjustedY - pos.y);
              
              // Check if cards would overlap (considering card dimensions)
              if (distanceX < minDistanceX && distanceY < minDistanceY) {
                hasOverlap = true;
                break;
              }
            }
            
            if (hasOverlap) {
              // Move to next grid position
              attempts++;
              const newRow = Math.floor((index + attempts) / itemsPerRow);
              const newCol = (index + attempts) % itemsPerRow;
              
              adjustedX = frameLeft + padding + newCol * horizontalSpacing + TASK_SHAPE_WIDTH / 2;
              adjustedY = frameTop + padding + newRow * verticalSpacing + TASK_SHAPE_HEIGHT / 2;
            }
          }
          
          // Ensure position is within frame bounds (with margin for card size)
          const shapeMargin = Math.max(TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT) / 2;
          const clampedX = Math.max(frameLeft + shapeMargin, Math.min(frameRight - shapeMargin, adjustedX));
          const clampedY = Math.max(frameTop + shapeMargin, Math.min(frameBottom - shapeMargin, adjustedY));
          
          const node = await miro.board.experimental.createMindmapNode({
            nodeView: {
              type: 'shape',
              shape: 'round_rectangle',
              content,
              style: {
                color: color, // Node color based on task status (Yellow/Green/Purple)
                fillOpacity: TASK_FILL_OPACITY,
                fontSize: 14,
                borderStyle: 'normal',
              },
            },
            x: clampedX,
            y: clampedY,
          });
          
          node.linkedTo = issue.url;
          await node.sync();
          
          await node.setMetadata(METADATA_KEY, {
            issueId: issue.idReadable,
            issueUrl: issue.url,
            stateName: issue.stateName,
            stateNameLocalized: issue.stateNameLocalized,
            tags: issue.tags,
            assignee: issue.assignee,
          });
          
          // Store position and dimensions of created card to prevent future overlaps
          createdPositions.push({ 
            x: clampedX, 
            y: clampedY, 
            width: TASK_SHAPE_WIDTH, 
            height: TASK_SHAPE_HEIGHT 
          });
          
          createdCount++;
          index++;
        }
      }

      // Save sync state
      const newSyncState: SyncState = {
        lastSyncAt: new Date().toISOString(),
        foundIssueCount: issues.length,
        updatedOnBoardCount: updatedCount,
        createdInNotFoundCount: createdCount,
      };
      saveSyncState(newSyncState);
      syncState.value = newSyncState;

      // Save sync query
      saveSettings({ syncQuery });

      alert(`Sync completed! Found ${issues.length} issues, updated ${updatedCount}, created ${createdCount} new items.`);
    } catch (error: any) {
      syncError.value = error.message || 'Failed to sync tasks';
      console.error('Failed to sync tasks:', error);
    } finally {
      isSyncing.value = false;
    }
  }

  return {
    syncState,
    isSyncing,
    syncError,
    syncedTasks,
    syncTasks,
  };
}
