<script setup lang="ts">
import './assets/style.css';
import { ref, onMounted } from 'vue';
import TabNavigation from './components/TabNavigation.vue';
import TasksTab from './components/TasksTab.vue';
import SyncTab from './components/SyncTab.vue';
import SettingsTab from './components/SettingsTab.vue';
import ToastContainer from './components/ToastContainer.vue';
import { useSettings } from './composables/useSettings';
import { useDropHandler } from './composables/useDropHandler';

const activeTab = ref<'tasks' | 'sync' | 'settings'>('tasks');
const { settings, hasValidSettings, initSettings } = useSettings();
const tasksTabRef = ref<InstanceType<typeof TasksTab> | null>(null);

useDropHandler();

function handleSettingsSaved() {
  // No tab switch, no auto-search — just persistence. Stay on Settings.
}

onMounted(async () => {
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
