<script setup lang="ts">
import './assets/style.css';
import { ref, onMounted } from 'vue';
import TabNavigation from './components/TabNavigation.vue';
import TasksTab from './components/TasksTab.vue';
import SyncTab from './components/SyncTab.vue';
import SettingsTab from './components/SettingsTab.vue';
import CreateIssueView from './components/CreateIssueView.vue';
import ToastContainer from './components/ToastContainer.vue';
import { useSettings } from './composables/useSettings';
import { useCreateIssue } from './composables/useCreateIssue';
import { useDropHandler } from './composables/useDropHandler';

const PENDING_CREATE_KEY = 'youtrack-plan-mindmap:pendingCreate';

const activeTab = ref<'tasks' | 'sync' | 'settings'>('tasks');
const { settings, initSettings } = useSettings();
const { isOpen: isCreateViewOpen, open: openCreateView } = useCreateIssue();
const tasksTabRef = ref<InstanceType<typeof TasksTab> | null>(null);

useDropHandler();

function handleSettingsSaved() {
  // No tab switch, no auto-search — just persistence. Stay on Settings.
}

function consumePendingCreate(): void {
  try {
    const raw = localStorage.getItem(PENDING_CREATE_KEY);
    if (!raw) return;
    localStorage.removeItem(PENDING_CREATE_KEY);
    const payload = JSON.parse(raw);
    void openCreateView({
      summary: typeof payload.summary === 'string' ? payload.summary : undefined,
      parentIssueId: typeof payload.parent === 'string' ? payload.parent : undefined,
      linkedIssueIds: Array.isArray(payload.linked) ? payload.linked : undefined,
      transformShapeId: typeof payload.transform === 'string' ? payload.transform : undefined,
    });
  } catch (e) {
    console.warn('Failed to consume pending create payload:', e);
  }
}

onMounted(async () => {
  // Consume create handoff first so the form opens immediately, even while
  // board-storage settings are still loading.
  consumePendingCreate();
  await initSettings();
  if (settings.value.youtrackBaseUrl && settings.value.youtrackToken) {
    setTimeout(() => {
      if (tasksTabRef.value) {
        const queryToUse = settings.value.taskQuery || '';
        tasksTabRef.value.loadTasks(queryToUse);
      }
    }, 100);
  }
});
</script>

<template>
  <div id="root" @dragover.prevent @drop.prevent>
    <div class="app-container">
      <CreateIssueView v-if="isCreateViewOpen" />
      <template v-else>
        <TabNavigation v-model:activeTab="activeTab" />

        <TasksTab
          v-if="activeTab === 'tasks'"
          ref="tasksTabRef"
          :initial-query="(settings.taskQuery || '')"
        />

        <SyncTab v-if="activeTab === 'sync'" />

        <SettingsTab
          v-if="activeTab === 'settings'"
          @saved="handleSettingsSaved"
        />
      </template>
    </div>
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}
</style>
