<script setup lang="ts">
import { ref, computed } from 'vue';
import { searchIssues } from '../youtrack/client';
import { YouTrackIssue } from '../youtrack/types';
import { saveSettings } from '../storage';
import TaskItem from './TaskItem.vue';
import { useSettings } from '../composables/useSettings';

interface Props {
  initialQuery?: string;
}

const props = withDefaults(defineProps<Props>(), {
  initialQuery: '',
});

const { hasValidSettings, getEffectiveSettings } = useSettings();

const taskQuery = ref(props.initialQuery);
const taskIssues = ref<YouTrackIssue[]>([]);
const isLoadingTasks = ref(false);
const taskError = ref<string | null>(null);

async function loadTasks(queryOverride?: string) {
  if (!hasValidSettings.value) {
    taskError.value = 'Please configure YouTrack settings first';
    return;
  }

  isLoadingTasks.value = true;
  taskError.value = null;

  try {
    const queryToUse = queryOverride !== undefined ? queryOverride : taskQuery.value;
    const { baseUrl, token, statusFieldName } = getEffectiveSettings();
    
    const issues = await searchIssues({
      baseUrl,
      token,
      query: queryToUse,
      statusFieldName,
    });
    taskIssues.value = issues;
    
    // Debug: log issues to check assignee
    if (issues.length > 0) {
      console.log('Loaded issues:', issues.length);
      console.log('First issue:', issues[0]);
      console.log('First issue assignee:', issues[0].assignee);
    }
    
    // Save task query to Miro board storage
    await saveSettings({ taskQuery: queryToUse });
    taskQuery.value = queryToUse;
  } catch (error: any) {
    taskError.value = error.message || 'Failed to load tasks';
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

    <div v-if="taskIssues.length > 0" class="task-list">
      <TaskItem
        v-for="issue in taskIssues"
        :key="issue.idReadable"
        :issue="issue"
        :draggable="true"
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

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--gray-500, #6b7280);
  font-size: 14px;
  line-height: 1.5;
}
</style>
