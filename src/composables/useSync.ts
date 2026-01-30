import { ref } from 'vue';
import { loadSyncState, saveSyncState, saveSettings, type SyncState } from '../storage';

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncAt: null,
  foundIssueCount: 0,
  updatedOnBoardCount: 0,
  createdInNotFoundCount: 0,
};
import { searchIssues, fetchIssuesLinks } from '../youtrack/client';
import { YouTrackIssue } from '../youtrack/types';
import { updateTaskShape, getTaskColor, buildTaskMindmapContent } from '../miro/taskShape';
import { getOrCreateNotFoundFrame, expandFrameIfNeeded, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from '../miro/notFoundFrame';
import { METADATA_KEY, TASK_FILL_OPACITY, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT } from '../constants';
import { createIssueConnector, getPluginConnectors, removeConnector } from '../miro/connectors';

type SyncedTaskItem = {
  issue: YouTrackIssue;
  itemId: string;
};

export function useSync() {
  const syncState = ref<SyncState>({ ...DEFAULT_SYNC_STATE });

  async function initSyncState(): Promise<void> {
    syncState.value = await loadSyncState();
  }
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const syncedTasks = ref<YouTrackIssue[]>([]);
  const syncedTaskItems = ref<SyncedTaskItem[]>([]);

  function getItemContent(item: any): string {
    if (typeof item?.content === 'string') {
      return item.content;
    }
    if (typeof item?.nodeView?.content === 'string') {
      return item.nodeView.content;
    }
    return '';
  }

  function extractIssueIdFromContent(content: string): string | null {
    const match = content.match(/<a[^>]*>([^<]+)<\/a>/);
    if (!match) {
      return null;
    }
    return match[1].trim() || null;
  }

  function extractIssueUrlFromContent(content: string): string {
    const match = content.match(/<a\s+href=["']([^"']+)["']/i);
    return match ? match[1] : '';
  }

  function stripHtml(text: string): string {
    return text
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/?[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildIssueFromContent(content: string, issueId: string): YouTrackIssue | null {
    const summaryMatch = content.match(/<\/a>\s*([^(]+)/);
    if (!summaryMatch) {
      return null;
    }

    return {
      idReadable: issueId,
      summary: stripHtml(summaryMatch[1]),
      tags: [],
      assignee: 'Unassigned',
      stateName: '',
      stateNameLocalized: null,
      url: extractIssueUrlFromContent(content),
    };
  }

  function collectMatchingTaskShapes(
    items: any[],
    issuesById?: Map<string, YouTrackIssue>
  ): {
    taskShapes: Array<{ shape: any; issueId: string; issue: YouTrackIssue }>;
    syncedTasksList: YouTrackIssue[];
    syncedTaskItems: SyncedTaskItem[];
  } {
    const taskShapes: Array<{ shape: any; issueId: string; issue: YouTrackIssue }> = [];
    const syncedTasksList: YouTrackIssue[] = [];
    const syncedTaskItems: SyncedTaskItem[] = [];

    for (const item of items) {
      const content = getItemContent(item);
      const issueId = extractIssueIdFromContent(content);
      if (!issueId) {
        continue;
      }

      const issue = issuesById?.get(issueId) ?? buildIssueFromContent(content, issueId);
      if (!issue || !item?.id) {
        continue;
      }

      taskShapes.push({ shape: item, issueId, issue });
      syncedTasksList.push(issue);
      syncedTaskItems.push({ issue, itemId: item.id });
    }

    return { taskShapes, syncedTasksList, syncedTaskItems };
  }

  async function refreshSyncedTasks(): Promise<void> {
    try {
      const allMindmapNodes = await miro.board.experimental.get({ type: 'mindmap_node' });
      const allShapes = await miro.board.get({ type: 'shape' });
      const allItems = [...allMindmapNodes, ...allShapes];

      const { syncedTasksList, syncedTaskItems: boardTaskItems } = collectMatchingTaskShapes(allItems);
      syncedTasks.value = syncedTasksList;
      syncedTaskItems.value = boardTaskItems;
    } catch (error) {
      console.warn('Failed to refresh synced tasks:', error);
    }
  }

  async function focusOnTask(issueId: string): Promise<void> {
    const item = syncedTaskItems.value.find(task => task.issue.idReadable === issueId);
    if (!item) {
      return;
    }

    const fetched = await miro.board.get({ id: item.itemId });
    const resolved = Array.isArray(fetched) ? fetched[0] : null;
    if (!resolved) {
      return;
    }

    try {
      const viewport = miro.board.viewport as any;
      await viewport.zoomTo(resolved, { padding: 200 });
    } catch (error) {
      try {
        await miro.board.viewport.zoomTo(resolved);
      } catch (fallbackError) {
        console.warn('Failed to zoom to task:', fallbackError);
      }
    }
  }

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

      // Build map by issue ID (idReadable)
      const issuesById = new Map<string, YouTrackIssue>();
      issues.forEach(issue => {
        issuesById.set(issue.idReadable, issue);
      });

      // Get all mindmap nodes and shapes on board (for backward compatibility)
      const allMindmapNodes = await miro.board.experimental.get({ type: 'mindmap_node' });
      const allShapes = await miro.board.get({ type: 'shape' });
      const allItems = [...allMindmapNodes, ...allShapes];
      
      // Identify matching task shapes by href task id only
      const { taskShapes: initialTaskShapes, syncedTasksList, syncedTaskItems: initialTaskItems } =
        collectMatchingTaskShapes(allItems, issuesById);
      const taskShapes = [...initialTaskShapes];
      
      // Update synced tasks list
      syncedTasks.value = syncedTasksList;
      syncedTaskItems.value = initialTaskItems;

      let updatedCount = 0;
      let createdCount = 0;

      // Update existing task shapes
      const remainingIssuesById = new Map(issuesById);
      for (const { shape, issueId, issue } of taskShapes) {
        await updateTaskShape(shape, issue);
        updatedCount++;
        remainingIssuesById.delete(issueId);
      }

      // Create missing issues in "Not found" frame
      if (remainingIssuesById.size > 0) {
        const notFoundFrame = await getOrCreateNotFoundFrame();
        
        // Spacing between cards (horizontal and vertical offset)
        // Use card dimensions + gap to prevent overlap
        const gap = 50;
        const padding = 50; // Padding from frame edges

        // Ensure frame is large enough for the grid layout
        let frame = notFoundFrame;
        for (let attempt = 0; attempt < 3; attempt++) {
          const frameWidth = frame.width || DEFAULT_FRAME_WIDTH;
          const availableWidth = frameWidth - padding * 2;
          const itemsPerRow = Math.max(1, Math.floor((availableWidth + gap) / (TASK_SHAPE_WIDTH + gap)));
          const rows = Math.ceil(remainingIssuesById.size / itemsPerRow);
          const requiredWidth = itemsPerRow * (TASK_SHAPE_WIDTH + gap) - gap + padding * 2;
          const requiredHeight = rows * (TASK_SHAPE_HEIGHT + gap) - gap + padding * 2;

          await expandFrameIfNeeded(frame, remainingIssuesById.size, itemsPerRow, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT, gap);
          await frame.sync();

          // Re-fetch frame to get updated dimensions after sync
          const updatedFrame = await miro.board.get({ id: frame.id });
          frame = updatedFrame && updatedFrame.length > 0 ? updatedFrame[0] : frame;

          const newWidth = frame.width || DEFAULT_FRAME_WIDTH;
          const newHeight = frame.height || DEFAULT_FRAME_HEIGHT;
          if (newWidth >= requiredWidth && newHeight >= requiredHeight) {
            break;
          }
        }

        const frameWidth = frame.width || DEFAULT_FRAME_WIDTH;
        const frameHeight = frame.height || DEFAULT_FRAME_HEIGHT;
        
        // Calculate frame boundaries (frame.x and frame.y are center coordinates)
        const frameLeft = frame.x - frameWidth / 2;
        const frameTop = frame.y - frameHeight / 2;
        
        // Calculate available space for cards (accounting for padding and card dimensions)
        const cardHalfWidth = TASK_SHAPE_WIDTH / 2;
        const cardHalfHeight = TASK_SHAPE_HEIGHT / 2;
        const availableLeft = frameLeft + padding + cardHalfWidth;
        const availableTop = frameTop + padding + cardHalfHeight;
        const availableWidth = frameWidth - padding * 2;
        const itemsPerRow = Math.max(1, Math.floor((availableWidth + gap) / (TASK_SHAPE_WIDTH + gap)));
        const stepX = TASK_SHAPE_WIDTH + gap;
        const stepY = TASK_SHAPE_HEIGHT + gap;
        
        let index = 0;
        for (const issue of remainingIssuesById.values()) {
          const color = getTaskColor(issue.stateName);
          const content = buildTaskMindmapContent(issue);
          
          // Calculate grid position
          const row = Math.floor(index / itemsPerRow);
          const col = index % itemsPerRow;

          // Position is center of card
          const finalX = availableLeft + col * stepX;
          const finalY = availableTop + row * stepY;
          
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
            x: finalX,
            y: finalY,
          });
          
          node.linkedTo = issue.url;
          await node.sync();
          
          await node.setMetadata(METADATA_KEY, {
            issueId: issue.idReadable,
            issueUrl: issue.url,
            stateName: issue.stateName,
            stateNameLocalized: issue.stateNameLocalized,
            tags: issue.tags.map(t => ({ name: t.name, color: t.color })),
            assignee: issue.assignee,
          });
          
          createdCount++;
          index++;

          // Track newly created nodes for connector sync
          taskShapes.push({ shape: node, issueId: issue.idReadable, issue });
          syncedTasks.value.push(issue);
          syncedTaskItems.value.push({ issue, itemId: node.id });
        }
      }

      // Sync connectors: fetch links and create/update/remove connectors
      await syncConnectors(baseUrl, token, taskShapes);

      // Save sync state
      const newSyncState: SyncState = {
        lastSyncAt: new Date().toISOString(),
        foundIssueCount: issues.length,
        updatedOnBoardCount: updatedCount,
        createdInNotFoundCount: createdCount,
      };
      await saveSyncState(newSyncState);
      syncState.value = newSyncState;

      // Save sync query to board storage
      await saveSettings({ syncQuery });

      alert(`Sync completed! Found ${issues.length} issues, updated ${updatedCount}, created ${createdCount} new items.`);
    } catch (error: any) {
      syncError.value = error.message || 'Failed to sync tasks';
      console.error('Failed to sync tasks:', error);
    } finally {
      isSyncing.value = false;
    }
  }

  /**
   * Sync connectors between issues based on YouTrack links
   * Follows strict workflow:
   * 1. Build map: youtrack_id -> board node id
   * 2. Build map: (type, from youtrack id, to youtrack_id) -> connector node id
   * 3. Flush all existing links between task nodes (only between them)
   * 4. Rewrite onto actual links
   */
  async function syncConnectors(
    baseUrl: string,
    token: string,
    taskShapes: Array<{ shape: any; issueId: string; issue: YouTrackIssue }>
  ): Promise<void> {
    try {
      // Step 1: Build map: youtrack_id -> board node id
      const youtrackIdToNodeIdMap = new Map<string, string>();
      const nodeIdToYoutrackIdMap = new Map<string, string>();
      const nodeIdToShapeMap = new Map<string, any>();

      for (const { shape, issueId } of taskShapes) {
        if (!shape?.id) {
          continue;
        }
        youtrackIdToNodeIdMap.set(issueId, shape.id);
        nodeIdToYoutrackIdMap.set(shape.id, issueId);
        nodeIdToShapeMap.set(shape.id, shape);
      }
      
      if (youtrackIdToNodeIdMap.size === 0) {
        return; // No task nodes on board
      }
      
      // Step 2: Build map: (type, from youtrack id, to youtrack_id) -> connector node id
      const existingConnectorsMap = new Map<string, string>(); // "linkType:fromId:toId" -> connector id
      const existingConnectors = await getPluginConnectors();
      
      for (const connector of existingConnectors) {
        try {
          const metadata = await connector.getMetadata('youtrack-connector');
          if (metadata && metadata.startIssueId && metadata.endIssueId) {
            const startYoutrackId = nodeIdToYoutrackIdMap.get(metadata.startIssueId);
            const endYoutrackId = nodeIdToYoutrackIdMap.get(metadata.endIssueId);
            
            // Only track connectors between task nodes (both ends are task nodes)
            if (startYoutrackId && endYoutrackId) {
              const linkKey = `${metadata.linkType}:${startYoutrackId}:${endYoutrackId}`;
              existingConnectorsMap.set(linkKey, connector.id);
            }
          }
        } catch (e) {
          // Skip connectors without proper metadata
        }
      }
      
      // Step 3: Flush all existing links between task nodes (only between them)
      // Remove all connectors that connect two task nodes
      for (const [, connectorId] of existingConnectorsMap.entries()) {
        try {
          const connector = existingConnectors.find(c => c.id === connectorId);
          if (connector) {
            console.log("removing connector", connector);
            await removeConnector(connector);
          }
        } catch (e) {
          console.warn('Failed to remove connector during flush:', e);
        }
      }
      
      // Step 4: Fetch links and rewrite onto actual links
      const issueIdsOnBoard = Array.from(youtrackIdToNodeIdMap.keys());
      const linksMap = await fetchIssuesLinks(baseUrl, token, issueIdsOnBoard);
      
      // Track created connectors to avoid duplicates (for bidirectional links)
      const createdConnectorKeys = new Set<string>();
      
      // Create connectors for all current links
      for (const [issueId, links] of linksMap.entries()) {
        const sourceNodeId = youtrackIdToNodeIdMap.get(issueId);
        if (!sourceNodeId) continue;
        
        const sourceShape = nodeIdToShapeMap.get(sourceNodeId);
        if (!sourceShape) continue;
        
        for (const link of links) {
          for (const linkedIssue of link.issues) {
            // Skip self-links
            if (linkedIssue.idReadable === issueId) continue;
            
            const targetNodeId = youtrackIdToNodeIdMap.get(linkedIssue.idReadable);
            if (!targetNodeId) continue; // Target not on board
            
            const targetShape = nodeIdToShapeMap.get(targetNodeId);
            if (!targetShape) continue;
            
            // Create unique key to avoid duplicates (sorted IDs for bidirectional links)
            const sortedIds = [issueId, linkedIssue.idReadable].sort();
            const connectorKey = `${link.linkType.name}:${sortedIds[0]}:${sortedIds[1]}`;
            
            if (createdConnectorKeys.has(connectorKey)) {
              continue; // Already created this connector
            }
            
            // Create connector for this link
            await createIssueConnector(
              sourceShape,
              targetShape,
              link.linkType.name,
              link.linkType.sourceToTarget
            );
            
            createdConnectorKeys.add(connectorKey);
          }
        }
      }
    } catch (error) {
      console.error('Failed to sync connectors:', error);
      // Don't throw - connector sync failure shouldn't break the main sync
    }
  }

  return {
    syncState,
    isSyncing,
    syncError,
    syncedTasks,
    syncedTaskItems,
    initSyncState,
    syncTasks,
    refreshSyncedTasks,
    focusOnTask,
  };
}
