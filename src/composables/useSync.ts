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
        
        const itemsPerRow = 4;
        const spacing = 250;
        const padding = 100;
        const startX = padding;
        const startY = padding;
        
        await expandFrameIfNeeded(notFoundFrame, issueMap.size, itemsPerRow, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT, spacing);
        await notFoundFrame.sync();
        
        const frameWidth = notFoundFrame.width || DEFAULT_FRAME_WIDTH;
        const frameHeight = notFoundFrame.height || DEFAULT_FRAME_HEIGHT;
        
        let index = 0;
        for (const issue of issueMap.values()) {
          const row = Math.floor(index / itemsPerRow);
          const col = index % itemsPerRow;
          const relX = startX + col * spacing;
          const relY = startY + row * spacing;
          
          const shapeX = notFoundFrame.x - (frameWidth / 2) + relX;
          const shapeY = notFoundFrame.y - (frameHeight / 2) + relY;
          
          const color = getTaskColor(issue.stateName);
          const content = buildTaskMindmapContent(issue);
          
          const frameLeft = notFoundFrame.x - frameWidth / 2;
          const frameTop = notFoundFrame.y - frameHeight / 2;
          const frameRight = notFoundFrame.x + frameWidth / 2;
          const frameBottom = notFoundFrame.y + frameHeight / 2;
          
          const shapeMargin = Math.max(TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT) / 2;
          const clampedX = Math.max(frameLeft + shapeMargin, Math.min(frameRight - shapeMargin, shapeX));
          const clampedY = Math.max(frameTop + shapeMargin, Math.min(frameBottom - shapeMargin, shapeY));
          
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
          node.fillColor = color; // Background color based on task status
          await node.sync();
          
          await node.setMetadata(METADATA_KEY, {
            issueId: issue.idReadable,
            issueUrl: issue.url,
            stateName: issue.stateName,
            stateNameLocalized: issue.stateNameLocalized,
            tags: issue.tags,
            assignee: issue.assignee,
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
