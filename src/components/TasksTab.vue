<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { searchIssues } from '../youtrack/client';
import { YouTrackIssue } from '../youtrack/types';
import TaskItem from './TaskItem.vue';
import { useSettings } from '../composables/useSettings';
import { useSync } from '../composables/useSync';
import { useToast } from '../composables/useToast';
import { METADATA_KEY } from '../constants';

interface Props {
  initialQuery?: string;
}

const props = withDefaults(defineProps<Props>(), {
  initialQuery: '',
});

const { hasValidSettings, settings, applySettings } = useSettings();
const { syncedTaskItems, refreshSyncedTasks, focusOnTask } = useSync();
const { show: showToast } = useToast();

const selectedNodeIssueId = ref<string | null>(null);

const selectedNonPluginText = ref<string | null>(null);
const selectedNonPluginShapeId = ref<string | null>(null);

function extractText(item: any): string {
  const candidates = [
    item?.content,
    item?.title,
    item?.text,
    item?.nodeView?.content,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      // Strip HTML tags from content
      const plain = c
        .replace(/<br\s*\/?>(\s|&nbsp;)*/gi, ' ')
        .replace(/<\/?[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (plain) return plain;
    }
  }
  return '';
}

async function readSelectionContext(): Promise<{
  pluginIssueId: string | null;
  nonPluginText: string | null;
  nonPluginShapeId: string | null;
}> {
  try {
    const selection = await miro.board.getSelection();
    if (!selection || selection.length === 0) {
      return { pluginIssueId: null, nonPluginText: null, nonPluginShapeId: null };
    }
    let pluginIssueId: string | null = null;
    let nonPluginText: string | null = null;
    let nonPluginShapeId: string | null = null;
    for (const item of selection) {
      try {
        const meta = await (item as any).getMetadata?.(METADATA_KEY);
        if (meta && typeof meta === 'object' && typeof (meta as any).issueId === 'string') {
          pluginIssueId = (meta as any).issueId as string;
          continue;
        }
      } catch {
        /* ignore */
      }
      const text = extractText(item);
      if (text && !nonPluginText) {
        nonPluginText = text;
        nonPluginShapeId = (item as any)?.id ?? null;
      }
    }
    return { pluginIssueId, nonPluginText, nonPluginShapeId };
  } catch {
    return { pluginIssueId: null, nonPluginText: null, nonPluginShapeId: null };
  }
}

async function refreshSelection(): Promise<void> {
  const ctx = await readSelectionContext();
  selectedNodeIssueId.value = ctx.pluginIssueId;
  selectedNonPluginText.value = ctx.nonPluginText;
  selectedNonPluginShapeId.value = ctx.nonPluginShapeId;
}

async function openCanvasCreateModal(opts: { summary?: string; parent?: string; linked?: string[]; transformShapeId?: string } = {}): Promise<void> {
  const params = new URLSearchParams();
  if (opts.summary) params.set('summary', opts.summary);
  if (opts.parent) params.set('parent', opts.parent);
  if (opts.linked && opts.linked.length > 0) params.set('linked', opts.linked.join(','));
  if (opts.transformShapeId) params.set('transform', opts.transformShapeId);
  const qs = params.toString();
  const url = `/create-issue.html${qs ? '?' + qs : ''}`;
  try {
    const result = await (miro.board.ui.openModal as any)({ url, fullscreen: false });
    if (result && typeof result === 'object' && typeof (result as any).idReadable === 'string') {
      const id = (result as any).idReadable as string;
      showToast('success', `Issue ${id} created and added to board`, 5000);
      await refreshSyncedTasks();
    }
  } catch (e) {
    console.error('Failed to open create-issue modal on canvas:', e);
    showToast('error', 'Could not open create dialog. Make sure the plugin manifest allows /create-issue.html.', 4000);
  }
}

function handleCreateIssue() {
  void openCanvasCreateModal({
    summary: selectedNonPluginText.value || undefined,
    transformShapeId: selectedNonPluginShapeId.value || undefined,
  });
}

function handleCreateSubtask() {
  if (!selectedNodeIssueId.value) return;
  void openCanvasCreateModal({
    parent: selectedNodeIssueId.value,
    summary: selectedNonPluginText.value || undefined,
    transformShapeId: selectedNonPluginShapeId.value || undefined,
  });
}

const taskQuery = ref(props.initialQuery);
const taskIssues = ref<YouTrackIssue[]>([]);
const isLoadingTasks = ref(false);
const taskError = ref<string | null>(null);
const lastSearchInfo = ref<string>('');

// On remount, prefer the most recently applied query (settings.value.taskQuery) over the
// stale prop snapshot — the prop is captured at App.vue mount time and may lag.
if (settings.value.taskQuery !== undefined && settings.value.taskQuery !== taskQuery.value) {
  taskQuery.value = settings.value.taskQuery;
}

const boardCountByIssueId = computed(() => {
  const map = new Map<string, number>();
  for (const { issue } of syncedTaskItems.value) {
    const id = issue.idReadable;
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
});

let selectionListener: ((event: any) => void) | null = null;

onMounted(async () => {
  await refreshSyncedTasks();
  await refreshSelection();
  selectionListener = () => {
    refreshSelection();
  };
  try {
    miro.board.ui.on('selection:update', selectionListener);
  } catch (e) {
    console.warn('Selection listener registration failed:', e);
  }
});

onUnmounted(() => {
  if (selectionListener) {
    try {
      miro.board.ui.off('selection:update', selectionListener);
    } catch {
      /* ignore */
    }
    selectionListener = null;
  }
});

async function loadTasks(queryOverride?: string) {
  if (!hasValidSettings.value) {
    taskError.value = 'Please configure YouTrack settings first';
    return;
  }

  isLoadingTasks.value = true;
  taskError.value = null;
  lastSearchInfo.value = '';

  try {
    const queryToUse = queryOverride !== undefined ? queryOverride : taskQuery.value;
    const issues = await searchIssues({
      baseUrl: settings.value.youtrackBaseUrl,
      token: settings.value.youtrackToken,
      query: queryToUse,
      statusFieldName: settings.value.statusFieldName,
    });
    taskIssues.value = issues;
    const msg = `Found ${issues.length} task${issues.length === 1 ? '' : 's'}`;
    lastSearchInfo.value = msg;
    showToast('success', msg);

    // Save the applied query so tab-switches/reloads keep the last "real" search,
    // not in-progress edits.
    await applySettings({ taskQuery: queryToUse });
    taskQuery.value = queryToUse;

    await refreshSyncedTasks();
  } catch (error: any) {
    taskError.value = error.message || 'Failed to load tasks';
    showToast('error', taskError.value || 'Failed to load tasks', 4000);
    console.error('Failed to load tasks:', error);
  } finally {
    isLoadingTasks.value = false;
  }
}

// Expose loadTasks for parent component
defineExpose<{
  loadTasks: (queryOverride?: string) => Promise<void>;
}>({
  loadTasks,
});
</script>

<template>
  <div class="tab-content">
    <h2>Search YouTrack Tasks</h2>
    <div class="create-actions">
      <button
        class="button button-primary"
        :disabled="!hasValidSettings"
        :title="selectedNonPluginText ? 'Create issue using selected shape’s text as summary; the shape itself becomes the task card.' : 'Create a new YouTrack issue and place a card on the board.'"
        @click="handleCreateIssue"
      >
        <span v-if="selectedNonPluginText">+ Turn selection into task</span>
        <span v-else>+ Create issue</span>
      </button>
      <button
        v-if="selectedNodeIssueId"
        class="button button-ghost"
        :disabled="!hasValidSettings"
        @click="handleCreateSubtask"
      >+ Subtask of {{ selectedNodeIssueId }}</button>
    </div>
    <div v-if="selectedNonPluginText" class="selection-hint">
      Will turn the selected shape into a task card. Summary prefilled from its text:
      <em>{{ selectedNonPluginText }}</em>
    </div>
    <div v-else class="selection-hint selection-hint-muted">
      Tip: select any shape with text on the board, then click <strong>Turn selection into task</strong> to convert it into a YouTrack issue (or right-click → <em>Create YouTrack issue</em>).
    </div>
    <div class="form-group">

      <label for="task-query">Search Query:</label>
      <input 
        id="task-query"
        v-model="taskQuery"
        type="text"
        placeholder="Leave empty for all issues (sorted by update date)"
        class="input"
        @keyup.enter="loadTasks()"
      />
      <button
        class="button button-primary"
        :disabled="isLoadingTasks || !hasValidSettings"
        @click="loadTasks()"
      >
        <span v-if="isLoadingTasks">Loading...</span>
        <span v-else>Search</span>
      </button>
    </div>

    <div v-if="taskError" class="error">{{ taskError }}</div>
    <div v-if="!hasValidSettings" class="warning">
      Please configure YouTrack settings in the Settings tab first.
    </div>
    <div v-if="lastSearchInfo" class="status-pill status-success">
      <span>✓</span> {{ lastSearchInfo }}
    </div>

    <div v-if="taskIssues.length > 0" class="task-list">
      <TaskItem
        v-for="issue in taskIssues"
        :key="issue.idReadable"
        :issue="issue"
        :draggable="true"
        :on-board-count="boardCountByIssueId.get(issue.idReadable) ?? 0"
        @navigate-to-board="focusOnTask"
      />
    </div>
    <div v-else-if="!isLoadingTasks && !taskError && hasValidSettings" class="empty-state">
      Enter a search query (or leave empty for all issues) and click "Search" to find tasks. Drag tasks onto the board to create task cards.
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .tab-content {
    padding: 12px;
  }
}

h2 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
  color: var(--gray-900, #111827);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
  color: var(--gray-700, #374151);
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--gray-300, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 8px;
  background: #ffffff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--blue-500, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.button-primary {
  background: var(--blue-600, #2563eb);
  color: white;
}

.button-primary:hover:not(:disabled) {
  background: var(--blue-700, #1d4ed8);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.button-primary:disabled {
  background: var(--gray-300, #d1d5db);
  color: var(--gray-500, #6b7280);
  cursor: not-allowed;
}

.error {
  padding: 12px;
  background: var(--red-50, #fef2f2);
  color: var(--red-700, #b91c1c);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  border: 1px solid var(--red-200, #fecaca);
}

.warning {
  padding: 12px;
  background: var(--yellow-50, #fffbeb);
  color: var(--yellow-800, #92400e);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  border: 1px solid var(--yellow-200, #fde68a);
}

.task-list {
  margin-top: 16px;
}

.create-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.button-ghost {
  background: transparent;
  color: var(--gray-700, #374151);
  border: 1px solid var(--gray-300, #d1d5db);
}

.button-ghost:hover:not(:disabled) {
  background: var(--gray-100, #f3f4f6);
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 12px;
}

.status-success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.selection-hint {
  margin-bottom: 12px;
  padding: 8px 12px;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  color: #0c4a6e;
  border-radius: 6px;
  font-size: 13px;
}

.selection-hint em {
  font-style: italic;
  font-weight: 500;
}

.selection-hint-muted {
  background: var(--gray-50, #f9fafb);
  border-color: var(--gray-200, #e5e7eb);
  color: var(--gray-600, #4b5563);
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--gray-500, #6b7280);
  font-size: 14px;
  line-height: 1.5;
}
</style>
