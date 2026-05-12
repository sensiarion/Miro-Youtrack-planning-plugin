import { ref } from 'vue';
import {
  loadSyncState,
  saveSyncState,
  type SyncState,
} from '../storage';
import { searchIssues, fetchIssuesLinks, fetchIssueMentions } from '../youtrack/client';
import { YouTrackIssue, YouTrackIssueLink } from '../youtrack/types';
import {
  updateTaskShape,
  getTaskColor,
  buildTaskMindmapContent,
} from '../miro/taskShape';
import {
  getOrCreateNotFoundFrame,
  expandFrameIfNeeded,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_FRAME_HEIGHT,
} from '../miro/notFoundFrame';
import {
  METADATA_KEY,
  TASK_FILL_OPACITY,
  TASK_SHAPE_WIDTH,
  TASK_SHAPE_HEIGHT,
  DEFAULT_STATE_COLORS,
  DEFAULT_SYNC_CONCURRENCY,
  STATE_COLOR_PALETTE,
  type ConnectorStyle,
} from '../constants';
import {
  createIssueConnector,
  getPluginConnectors,
  removeConnector,
  getStyleForLinkType,
  getDefaultStyleForLinkType,
} from '../miro/connectors';
import { useSettings } from './useSettings';
import { useToast } from './useToast';
import { runWithConcurrency, clampConcurrency } from '../utils/parallel';

const DEFAULT_SYNC_STATE: SyncState = {
  lastSyncAt: null,
  foundIssueCount: 0,
  updatedOnBoardCount: 0,
  createdInNotFoundCount: 0,
};

type SyncedTaskItem = {
  issue: YouTrackIssue;
  itemId: string;
};

export function useSync() {
  const { settings, applySettings } = useSettings();
  const { show: showToast } = useToast();
  const syncState = ref<SyncState>({ ...DEFAULT_SYNC_STATE });

  async function initSyncState(): Promise<void> {
    syncState.value = await loadSyncState();
  }
  const isSyncing = ref(false);
  const syncError = ref<string | null>(null);
  const syncSuccess = ref<string | null>(null);
  const syncCancelled = ref<string | null>(null);
  const syncProgress = ref<string>('');
  const syncedTasks = ref<YouTrackIssue[]>([]);
  const syncedTaskItems = ref<SyncedTaskItem[]>([]);

  let syncAbortController: AbortController | null = null;
  function cancelSync(): void {
    if (syncAbortController) syncAbortController.abort();
  }

  function issueFromMetadata(metadata: any): YouTrackIssue | null {
    if (!metadata || typeof metadata !== 'object' || typeof metadata.issueId !== 'string') {
      return null;
    }
    return {
      idReadable: metadata.issueId,
      url: typeof metadata.issueUrl === 'string' ? metadata.issueUrl : '',
      summary: typeof metadata.summary === 'string' ? metadata.summary : '',
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      assignee: typeof metadata.assignee === 'string' ? metadata.assignee : 'Unassigned',
      stateName: typeof metadata.stateName === 'string' ? metadata.stateName : '',
      stateNameLocalized: typeof metadata.stateNameLocalized === 'string'
        ? metadata.stateNameLocalized
        : null,
    };
  }

  /**
   * Walk plugin-managed shapes/nodes (those with METADATA_KEY) and return tuples of
   * (shape, issueId, issue, isFresh). Issue data comes from `issuesById` when present,
   * otherwise from the card's stamped metadata. Items without metadata are skipped.
   */
  async function collectMatchingTaskShapes(
    items: any[],
    issuesById?: Map<string, YouTrackIssue>,
  ): Promise<{
    taskShapes: Array<{ shape: any; issueId: string; issue: YouTrackIssue; isFresh: boolean }>;
    syncedTasksList: YouTrackIssue[];
    syncedTaskItems: SyncedTaskItem[];
  }> {
    const taskShapes: Array<{
      shape: any;
      issueId: string;
      issue: YouTrackIssue;
      isFresh: boolean;
    }> = [];
    const syncedTasksList: YouTrackIssue[] = [];
    const syncedTaskItemsList: SyncedTaskItem[] = [];

    for (const item of items) {
      if (!item?.id || typeof item.getMetadata !== 'function') continue;
      const metadata = await item.getMetadata(METADATA_KEY).catch(() => null);
      const fromMeta = issueFromMetadata(metadata);
      if (!fromMeta) continue;

      const fresh = issuesById?.get(fromMeta.idReadable);
      const issue = fresh ?? fromMeta;
      taskShapes.push({ shape: item, issueId: fromMeta.idReadable, issue, isFresh: !!fresh });
      syncedTasksList.push(issue);
      syncedTaskItemsList.push({ issue, itemId: item.id });
    }

    return { taskShapes, syncedTasksList, syncedTaskItems: syncedTaskItemsList };
  }

  async function refreshSyncedTasks(): Promise<void> {
    try {
      const allMindmapNodes = await miro.board.experimental.get({ type: 'mindmap_node' });
      const allShapes = await miro.board.get({ type: 'shape' });
      const allItems = [...allMindmapNodes, ...allShapes];

      const { syncedTasksList, syncedTaskItems: boardTaskItems } =
        await collectMatchingTaskShapes(allItems);
      syncedTasks.value = syncedTasksList;
      syncedTaskItems.value = boardTaskItems;
    } catch (error) {
      console.warn('Failed to refresh synced tasks:', error);
    }
  }

  const FOCUS_ZOOM_OUT_FACTOR = 0.82;
  const FOCUS_SELECT_DURATION_MS = 2200;

  async function focusOnTask(issueId: string): Promise<void> {
    const itemsForIssue = syncedTaskItems.value.filter(
      task => task.issue.idReadable === issueId,
    );
    if (itemsForIssue.length === 0) {
      return;
    }

    const itemIds = itemsForIssue.map(i => i.itemId);
    const fetched = await miro.board.get({ id: itemIds });
    const resolved = Array.isArray(fetched) ? fetched : [fetched];
    if (resolved.length === 0) {
      return;
    }

    try {
      await miro.board.viewport.zoomTo(resolved);
      const zoom = await miro.board.viewport.getZoom();
      await miro.board.viewport.setZoom(zoom * FOCUS_ZOOM_OUT_FACTOR);

      await miro.board.select({ id: itemIds });
      setTimeout(() => {
        miro.board.deselect({ id: itemIds }).catch(() => {});
      }, FOCUS_SELECT_DURATION_MS);
    } catch (error) {
      try {
        await miro.board.viewport.zoomTo(resolved.length === 1 ? resolved[0] : resolved);
      } catch (fallbackError) {
        console.warn('Failed to zoom to task:', fallbackError);
      }
    }
  }

  async function syncTasks(syncQuery: string) {
    isSyncing.value = true;
    syncError.value = null;
    syncSuccess.value = null;
    syncCancelled.value = null;
    syncProgress.value = 'Fetching issues from YouTrack…';
    syncAbortController = new AbortController();
    const signal = syncAbortController.signal;
    const checkCancel = (): boolean => signal.aborted;

    try {
      const concurrency = clampConcurrency(settings.value.concurrency || DEFAULT_SYNC_CONCURRENCY);
      const previousStateColors = settings.value.stateColors ?? {};

      const baseUrl = settings.value.youtrackBaseUrl;
      const token = settings.value.youtrackToken;
      const statusFieldName = settings.value.statusFieldName;
      const deleteMissingOnSync = settings.value.deleteMissingOnSync;
      const issues = await searchIssues(
        {
          baseUrl,
          token,
          query: syncQuery,
          statusFieldName,
        },
        {
          signal,
          onPage: (_page, total) => {
            syncProgress.value = `Fetching issues from YouTrack… (${total} so far)`;
            return !checkCancel();
          },
        },
      );
      if (checkCancel()) {
        syncCancelled.value = `Sync cancelled before update — ${issues.length} fetched, no changes applied.`;
        showToast('info', syncCancelled.value);
        syncProgress.value = '';
        return;
      }

      // Build state color map containing ONLY states present in the current sync.
      // Preserve user-customized color when the state still appears; otherwise default.
      const stateColors: Record<string, string> = {};
      for (const issue of issues) {
        const displayName = issue.stateNameLocalized || issue.stateName;
        if (!displayName || displayName in stateColors) continue;
        if (displayName in previousStateColors) {
          stateColors[displayName] = previousStateColors[displayName];
        } else if (issue.stateName && issue.stateName in DEFAULT_STATE_COLORS) {
          stateColors[displayName] = DEFAULT_STATE_COLORS[issue.stateName];
        } else {
          stateColors[displayName] = STATE_COLOR_PALETTE[0];
        }
      }

      await applySettings({ stateColors });

      // Build map by issue ID (idReadable)
      const issuesById = new Map<string, YouTrackIssue>();
      issues.forEach(issue => {
        issuesById.set(issue.idReadable, issue);
      });

      // Get all mindmap nodes and shapes on board (for backward compatibility)
      const allMindmapNodes = await miro.board.experimental.get({ type: 'mindmap_node' });
      const allShapes = await miro.board.get({ type: 'shape' });
      const allItems = [...allMindmapNodes, ...allShapes];

      const {
        taskShapes: initialTaskShapes,
        syncedTasksList,
        syncedTaskItems: initialTaskItems,
      } = await collectMatchingTaskShapes(allItems, issuesById);
      const taskShapes = [...initialTaskShapes];

      // Update synced tasks list
      syncedTasks.value = syncedTasksList;
      syncedTaskItems.value = initialTaskItems;

      // Only update shapes whose issue is in the current sync results.
      // Shapes outside the query are left untouched (fixes #4 + assignee duplication on resync).
      const updatableShapes = taskShapes.filter(t => t.isFresh && issuesById.has(t.issueId));
      syncProgress.value = `Updating ${updatableShapes.length} card${updatableShapes.length === 1 ? '' : 's'} on board…`;
      let updatedCount = 0;
      await runWithConcurrency(updatableShapes, concurrency, async ({ shape, issue }) => {
        if (checkCancel()) return;
        await updateTaskShape(shape, issue, stateColors);
        updatedCount++;
      });
      if (checkCancel()) {
        syncCancelled.value = `Sync cancelled during update — ${updatedCount}/${updatableShapes.length} updated, nothing created.`;
        showToast('info', syncCancelled.value);
        syncProgress.value = '';
        return;
      }

      const remainingIssuesById = new Map(issuesById);
      for (const { issueId } of updatableShapes) {
        remainingIssuesById.delete(issueId);
      }

      // Optional: delete plugin-managed cards whose issueId is not in sync results.
      let deletedCount = 0;
      if (deleteMissingOnSync) {
        const toRemove = taskShapes.filter(t => !issuesById.has(t.issueId));
        for (const { shape } of toRemove) {
          if (checkCancel()) break;
          try {
            await miro.board.remove(shape);
            deletedCount++;
          } catch (e) {
            console.warn('Failed to remove missing card:', e);
          }
        }
        // Drop removed shapes from local lists for connector pass.
        const removedIds = new Set(toRemove.map(t => t.shape.id));
        for (let i = taskShapes.length - 1; i >= 0; i--) {
          if (removedIds.has(taskShapes[i].shape.id)) taskShapes.splice(i, 1);
        }
      }

      let createdCount = 0;
      if (checkCancel()) {
        syncCancelled.value = `Sync cancelled — ${updatedCount} updated, ${deletedCount} removed, no new cards created.`;
        showToast('info', syncCancelled.value);
        syncProgress.value = '';
        return;
      }

      // Create missing issues in "Not found" frame
      if (remainingIssuesById.size > 0) {
        syncProgress.value = `Creating ${remainingIssuesById.size} missing card${remainingIssuesById.size === 1 ? '' : 's'} in "Not found" frame…`;
      }
      const PLACEMENT_GAP = 50;
      const PLACEMENT_PADDING = 50;
      const SIZE_GUARD = 30; // extra slack so estimated card grids don't end up overlapping when actual size is bigger
      if (remainingIssuesById.size > 0) {
        const notFoundFrame = await getOrCreateNotFoundFrame();

        // Spacing between cards (horizontal and vertical offset)
        const gap = PLACEMENT_GAP;
        const padding = PLACEMENT_PADDING;

        let frame = notFoundFrame;
        for (let attempt = 0; attempt < 3; attempt++) {
          const frameWidth = frame.width || DEFAULT_FRAME_WIDTH;
          const availableWidth = frameWidth - padding * 2;
          const itemsPerRow = Math.max(
            1,
            Math.floor((availableWidth + gap) / (TASK_SHAPE_WIDTH + gap)),
          );
          const rows = Math.ceil(remainingIssuesById.size / itemsPerRow);
          const requiredWidth = itemsPerRow * (TASK_SHAPE_WIDTH + gap) - gap + padding * 2;
          const requiredHeight = rows * (TASK_SHAPE_HEIGHT + gap) - gap + padding * 2;

          await expandFrameIfNeeded(
            frame,
            remainingIssuesById.size,
            itemsPerRow,
            TASK_SHAPE_WIDTH,
            TASK_SHAPE_HEIGHT,
            gap,
          );
          await frame.sync();

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

        const frameLeft = frame.x - frameWidth / 2;
        const frameTop = frame.y - frameHeight / 2;

        const cardHalfWidth = TASK_SHAPE_WIDTH / 2;
        const cardHalfHeight = TASK_SHAPE_HEIGHT / 2;
        const availableLeft = frameLeft + padding + cardHalfWidth;
        const availableTop = frameTop + padding + cardHalfHeight;
        const availableWidth = frameWidth - padding * 2;
        const itemsPerRow = Math.max(
          1,
          Math.floor((availableWidth + gap) / (TASK_SHAPE_WIDTH + gap)),
        );
        const stepX = TASK_SHAPE_WIDTH + gap;
        const stepY = TASK_SHAPE_HEIGHT + gap;

        const issuesToCreate = Array.from(remainingIssuesById.values());
        const createdNodes = (await runWithConcurrency(
          issuesToCreate,
          concurrency,
          async (issue, index) => {
            if (checkCancel()) return null;
            const stateKey = issue.stateNameLocalized || issue.stateName;
            const color = getTaskColor(stateKey, stateColors, issue.stateName);
            const content = buildTaskMindmapContent(issue);

            // Initial estimated position; will be corrected after measuring actual sizes.
            const row = Math.floor(index / itemsPerRow);
            const col = index % itemsPerRow;
            const tempX = availableLeft + col * stepX;
            const tempY = availableTop + row * stepY;

            const node = await miro.board.experimental.createMindmapNode({
              nodeView: {
                type: 'shape',
                shape: 'round_rectangle',
                content,
                style: {
                  color,
                  fillOpacity: TASK_FILL_OPACITY,
                  fontSize: 14,
                  borderStyle: 'normal',
                },
              },
              x: tempX,
              y: tempY,
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

            return { issue, node, index };
          },
        )).filter((x): x is { issue: YouTrackIssue; node: any; index: number } => x !== null);

        // Measure-then-reposition: mindmap nodes auto-size to content, so the
        // initial grid based on TASK_SHAPE_WIDTH/HEIGHT can overlap. Recompute
        // grid using max actual node size and rewrite each node's x/y.
        if (createdNodes.length > 0) {
          let maxNodeW = TASK_SHAPE_WIDTH;
          let maxNodeH = TASK_SHAPE_HEIGHT;
          for (const { node } of createdNodes) {
            const w = (node as any).width;
            const h = (node as any).height;
            if (typeof w === 'number' && w > maxNodeW) maxNodeW = w;
            if (typeof h === 'number' && h > maxNodeH) maxNodeH = h;
          }
          maxNodeW += SIZE_GUARD;
          maxNodeH += SIZE_GUARD;
          const refreshedFrame = await miro.board.get({ id: frame.id });
          const f = refreshedFrame && refreshedFrame.length > 0 ? refreshedFrame[0] : frame;
          const fW = f.width || DEFAULT_FRAME_WIDTH;
          const fH = f.height || DEFAULT_FRAME_HEIGHT;
          const fLeft = f.x - fW / 2;
          const fTop = f.y - fH / 2;
          const newAvailableWidth = fW - padding * 2;
          const newItemsPerRow = Math.max(
            1,
            Math.floor((newAvailableWidth + gap) / (maxNodeW + gap)),
          );
          const newAvailableLeft = fLeft + padding + maxNodeW / 2;
          const newAvailableTop = fTop + padding + maxNodeH / 2;
          const newStepX = maxNodeW + gap;
          const newStepY = maxNodeH + gap;
          const requiredHeight =
            Math.ceil(createdNodes.length / newItemsPerRow) * newStepY - gap + padding * 2;
          if ((f.height || 0) < requiredHeight) {
            f.height = Math.max(f.height || 0, requiredHeight);
            try {
              await f.sync();
            } catch (e) {
              console.warn('Could not resize frame for not-found grid:', e);
            }
          }
          await runWithConcurrency(createdNodes, concurrency, async ({ node, index }) => {
            const r = Math.floor(index / newItemsPerRow);
            const c = index % newItemsPerRow;
            try {
              (node as any).x = newAvailableLeft + c * newStepX;
              (node as any).y = newAvailableTop + r * newStepY;
              await node.sync();
            } catch (e) {
              console.warn('Failed to reposition card after sizing:', e);
            }
          });
        }

        for (const { issue, node } of createdNodes) {
          taskShapes.push({ shape: node, issueId: issue.idReadable, issue, isFresh: true });
          syncedTasks.value.push(issue);
          syncedTaskItems.value.push({ issue, itemId: node.id });
          createdCount++;
        }
      }

      if (checkCancel()) {
        syncCancelled.value = `Sync cancelled — ${updatedCount} updated, ${createdCount} created. Connectors not synced.`;
        showToast('info', syncCancelled.value);
        syncProgress.value = '';
        return;
      }

      // Sync connectors with discovered link types and configured styles.
      // Use previously-saved styles as the source of truth for current run; prune after.
      const previousConnectorStyles = settings.value.connectorStyles ?? {};
      syncProgress.value = 'Syncing connectors…';
      const discoveredLabels = new Map<string, string>();
      const discoveredLinkTypes = await syncConnectors(
        baseUrl,
        token,
        taskShapes,
        previousConnectorStyles,
        concurrency,
        discoveredLabels,
      );

      // Merge discovered link types into previously-saved styles. Never prune:
      // user customizations for link types not present in this sync's results
      // must survive (e.g. when sync query excludes subtask-linked issues).
      const connectorStyles: Record<string, ConnectorStyle> = { ...previousConnectorStyles };
      const connectorLinkLabels: Record<string, string> = {
        ...(settings.value.connectorLinkLabels ?? {}),
      };
      for (const [name] of discoveredLinkTypes) {
        if (!(name in connectorStyles)) {
          connectorStyles[name] = getDefaultStyleForLinkType(name);
        }
        const label = discoveredLabels.get(name);
        if (label) connectorLinkLabels[name] = label;
      }
      await applySettings({ connectorStyles, connectorLinkLabels });

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
      await applySettings({ syncQuery });

      const deletedSummary = deleteMissingOnSync ? `, removed ${deletedCount} stale` : '';
      const msg = `Sync done — ${issues.length} found, ${updatedCount} updated, ${createdCount} created${deletedSummary}.`;
      syncSuccess.value = msg;
      syncProgress.value = '';
      showToast('success', msg, 5000);
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        syncCancelled.value = syncCancelled.value || 'Sync cancelled.';
        showToast('info', syncCancelled.value);
      } else {
        syncError.value = error.message || 'Failed to sync tasks';
        showToast('error', syncError.value || 'Sync failed', 4000);
        console.error('Failed to sync tasks:', error);
      }
      syncProgress.value = '';
    } finally {
      isSyncing.value = false;
      syncAbortController = null;
    }
  }

  /**
   * Sync connectors between issues based on YouTrack links.
   * 1. Build map: youtrack_id -> board node id
   * 2. Flush all existing plugin-managed connectors between task nodes
   * 3. Create connectors for current YouTrack links using configured per-type styles
   *
   * Returns a map of discovered linkTypeName -> sourceToTarget for Settings UI seeding.
   */
  async function syncConnectors(
    baseUrl: string,
    token: string,
    taskShapes: Array<{ shape: any; issueId: string; issue: YouTrackIssue }>,
    connectorStyles: Record<string, ConnectorStyle>,
    concurrency: number,
    discoveredLabels?: Map<string, string>,
  ): Promise<Map<string, string>> {
    const discoveredLinkTypes = new Map<string, string>(); // name -> sourceToTarget
    try {
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
        return discoveredLinkTypes;
      }

      const existingConnectors = await getPluginConnectors();
      const toRemove: any[] = [];
      for (const connector of existingConnectors) {
        try {
          const metadata = await connector.getMetadata('youtrack-connector');
          if (metadata && metadata.startIssueId && metadata.endIssueId) {
            const startYoutrackId = nodeIdToYoutrackIdMap.get(metadata.startIssueId);
            const endYoutrackId = nodeIdToYoutrackIdMap.get(metadata.endIssueId);
            if (startYoutrackId && endYoutrackId) {
              toRemove.push(connector);
            }
          }
        } catch (e) {
          // skip
        }
      }
      await runWithConcurrency(toRemove, concurrency, async connector => {
        await removeConnector(connector);
      });

      const issueIdsOnBoard = Array.from(youtrackIdToNodeIdMap.keys());
      const linksMap = await fetchIssuesLinksLimited(baseUrl, token, issueIdsOnBoard, concurrency);
      // Augment with "Mentions" virtual links parsed from issue descriptions + comments.
      // We restrict mention edges to pairs where both endpoints are on the board to
      // avoid creating dangling references.
      const issueIdsOnBoardSet = new Set(issueIdsOnBoard);
      await runWithConcurrency(issueIdsOnBoard, concurrency, async issueId => {
        const mentions = await fetchIssueMentions(baseUrl, token, issueId);
        if (mentions.length === 0) return;
        const filtered = mentions
          .map(link => ({
            ...link,
            issues: link.issues.filter(i => issueIdsOnBoardSet.has(i.idReadable)),
          }))
          .filter(link => link.issues.length > 0);
        if (filtered.length === 0) return;
        const existing = linksMap.get(issueId) ?? [];
        linksMap.set(issueId, [...existing, ...filtered]);
      });

      const createdConnectorKeys = new Set<string>();
      const creationTasks: Array<{
        sourceShape: any;
        targetShape: any;
        link: YouTrackIssueLink;
      }> = [];

      for (const [issueId, links] of linksMap.entries()) {
        const currentNodeId = youtrackIdToNodeIdMap.get(issueId);
        if (!currentNodeId) continue;

        const currentShape = nodeIdToShapeMap.get(currentNodeId);
        if (!currentShape) continue;

        for (const link of links) {
          if (link?.linkType?.name) {
            discoveredLinkTypes.set(link.linkType.name, link.linkType.sourceToTarget || '');
            if (discoveredLabels) {
              const localized = link.linkType.localizedName || link.linkType.localizedSourceToTarget;
              if (localized) discoveredLabels.set(link.linkType.name, localized);
            }
          }
          for (const linkedIssue of link.issues) {
            if (linkedIssue.idReadable === issueId) continue;

            const linkedNodeId = youtrackIdToNodeIdMap.get(linkedIssue.idReadable);
            if (!linkedNodeId) continue;

            const linkedShape = nodeIdToShapeMap.get(linkedNodeId);
            if (!linkedShape) continue;

            // Canonical orientation: connector always points from link's SOURCE
            // to its TARGET, regardless of which endpoint we're iterating from.
            // direction='outward': current issue IS the source → current → linked
            // direction='inward':  current issue is the target → linked → current
            // direction='both':    symmetric, pick stable ordering (no arrow anyway)
            const currentIsSource = link.direction !== 'inward';
            const sourceShape = currentIsSource ? currentShape : linkedShape;
            const targetShape = currentIsSource ? linkedShape : currentShape;

            const sortedIds = [issueId, linkedIssue.idReadable].sort();
            const connectorKey = `${link.linkType.name}:${sortedIds[0]}:${sortedIds[1]}`;
            if (createdConnectorKeys.has(connectorKey)) continue;
            createdConnectorKeys.add(connectorKey);

            creationTasks.push({
              sourceShape,
              targetShape,
              link: { ...link, issues: [linkedIssue], direction: link.direction },
            });
          }
        }
      }

      await runWithConcurrency(creationTasks, concurrency, async ({ sourceShape, targetShape, link }) => {
        const style = getStyleForLinkType(link.linkType.name, connectorStyles);
        await createIssueConnector(
          sourceShape,
          targetShape,
          link.linkType.name,
          link.linkType.sourceToTarget,
          style,
        );
      });
    } catch (error) {
      console.error('Failed to sync connectors:', error);
    }
    return discoveredLinkTypes;
  }

  /** Like fetchIssuesLinks but with capped concurrency. */
  async function fetchIssuesLinksLimited(
    baseUrl: string,
    token: string,
    issueIds: string[],
    concurrency: number,
  ): Promise<Map<string, YouTrackIssueLink[]>> {
    if (issueIds.length === 0) return new Map();
    // For up to 10 issues just use the existing parallel helper.
    if (issueIds.length <= concurrency) {
      return fetchIssuesLinks(baseUrl, token, issueIds);
    }
    const map = new Map<string, YouTrackIssueLink[]>();
    await runWithConcurrency(issueIds, concurrency, async issueId => {
      const single = await fetchIssuesLinks(baseUrl, token, [issueId]);
      const links = single.get(issueId);
      if (links) map.set(issueId, links);
    });
    return map;
  }

  return {
    syncState,
    isSyncing,
    syncError,
    syncSuccess,
    syncCancelled,
    syncProgress,
    cancelSync,
    syncedTasks,
    syncedTaskItems,
    initSyncState,
    syncTasks,
    refreshSyncedTasks,
    focusOnTask,
  };
}
