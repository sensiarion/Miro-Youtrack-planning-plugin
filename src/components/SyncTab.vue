<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useSettings } from '../composables/useSettings';
import { useSync } from '../composables/useSync';
import TaskItem from './TaskItem.vue';

const { hasValidSettings, getEffectiveSettings, settings } = useSettings();
const {
  syncState,
  isSyncing,
  syncError,
  syncedTasks,
  syncedTaskItems,
  syncTasks: performSync,
  refreshSyncedTasks,
  focusOnTask,
} = useSync();

const syncQuery = ref(settings.value.syncQuery || '');
const searchQuery = ref('');

async function handleSync() {
  if (!hasValidSettings.value) {
    return;
  }

  await performSync(syncQuery.value, getEffectiveSettings);
  
  // Update local settings ref to reflect saved query
  settings.value.syncQuery = syncQuery.value;
}

const filteredTaskItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) {
    return syncedTaskItems.value;
  }

  return syncedTaskItems.value.filter(item => {
    const issue = item.issue;
    const tags = issue.tags.map(tag => tag.name).join(' ');
    return [
      issue.idReadable,
      issue.summary,
      issue.assignee,
      issue.stateNameLocalized || issue.stateName,
      tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
});

onMounted(async () => {
  await refreshSyncedTasks();
  if (typeof window !== 'undefined') {
    const handler = () => {
      refreshSyncedTasks();
    };
    window.addEventListener('synced-tasks-refresh', handler);
    onUnmounted(() => {
      window.removeEventListener('synced-tasks-refresh', handler);
    });
  }
});
</script>

<template>
  <div class="tab-content">
    <h2>Sync Tasks</h2>
    <div class="form-group">
      <label for="sync-query">Sync Query:</label>
      <input 
        id="sync-query"
        v-model="syncQuery"
        type="text"
        placeholder="e.g., State: In Progress"
        class="input"
      />
      <button 
        class="button button-primary"
        :disabled="isSyncing || !hasValidSettings"
        @click="handleSync"
      >
        <span v-if="isSyncing">Syncing...</span>
        <span v-else>Sync Now</span>
      </button>
    </div>

    <div class="form-group">
      <label for="sync-search">Search synced tasks:</label>
      <input
        id="sync-search"
        v-model="searchQuery"
        type="text"
        placeholder="Search by id, summary, assignee, tag..."
        class="input"
      />
    </div>

    <div v-if="syncError" class="error">{{ syncError }}</div>
    <div v-if="!hasValidSettings" class="warning">
      Please configure YouTrack settings in the Settings tab first.
    </div>

    <div class="sync-info">
      <div class="info-item">
        <strong>Last Sync:</strong>
        <span>{{ syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : 'Never' }}</span>
      </div>
      <div class="info-item">
        <strong>Found Issues:</strong>
        <span>{{ syncState.foundIssueCount }}</span>
      </div>
      <div class="info-item">
        <strong>Updated on Board:</strong>
        <span>{{ syncState.updatedOnBoardCount }}</span>
      </div>
      <div class="info-item">
        <strong>Created in "Not found":</strong>
        <span>{{ syncState.createdInNotFoundCount }}</span>
      </div>
    </div>

    <div class="synced-tasks-section">
      <h3>Synced Tasks on Board ({{ filteredTaskItems.length }})</h3>
      <div class="task-list">
        <TaskItem
          v-for="item in filteredTaskItems"
          :key="item.issue.idReadable"
          :issue="item.issue"
          :clickable="true"
          @click="focusOnTask(item.issue.idReadable)"
        />
      </div>
    </div>
    <div v-if="filteredTaskItems.length === 0 && !isSyncing && hasValidSettings" class="empty-state">
      No synced tasks found on board. Run a sync to see tasks here.
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

.sync-info {
  margin-top: 16px;
  padding: 16px;
  background: var(--gray-50, #f9fafb);
  border-radius: 6px;
  border: 1px solid var(--gray-200, #e5e7eb);
}

.info-item {
  margin-bottom: 12px;
  font-size: 14px;
  display: flex;
  align-items: baseline;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item strong {
  display: inline-block;
  min-width: 150px;
  color: var(--gray-700, #374151);
  margin-right: 8px;
}

.info-item span {
  color: var(--gray-900, #111827);
  font-weight: 500;
}

.synced-tasks-section {
  margin-top: 24px;
}

.synced-tasks-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--gray-900, #111827);
}

.task-list {
  margin-top: 16px;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--gray-500, #6b7280);
  font-size: 14px;
  line-height: 1.5;
}
</style>
