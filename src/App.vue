<script setup lang="ts">
import './assets/style.css';
import { ref, onMounted } from 'vue';
import { loadSettings } from './storage';
import TabNavigation from './components/TabNavigation.vue';
import TasksTab from './components/TasksTab.vue';
import SyncTab from './components/SyncTab.vue';
import SettingsTab from './components/SettingsTab.vue';
import { useSettings } from './composables/useSettings';
import { useDropHandler } from './composables/useDropHandler';

const activeTab = ref<'tasks' | 'sync' | 'settings'>('tasks');
const { hasValidSettings } = useSettings();
const tasksTabRef = ref<InstanceType<typeof TasksTab> | null>(null);

// Initialize drop handler
useDropHandler();

// Handle settings saved - switch to tasks tab and load tasks
function handleSettingsSaved() {
  activeTab.value = 'tasks';
  // Trigger search after a short delay to ensure settings are saved
  // Use saved query if exists, otherwise use empty string (default search)
  setTimeout(() => {
    if (tasksTabRef.value) {
      const settings = loadSettings();
      const queryToUse = settings.taskQuery || '';
      tasksTabRef.value.loadTasks(queryToUse);
    }
  }, 100);
}

// Auto-load tasks if settings are configured
onMounted(async () => {
  const settings = loadSettings();
  if (settings.youtrackBaseUrl && settings.youtrackToken) {
    // Small delay to ensure component is mounted
    setTimeout(() => {
      if (tasksTabRef.value) {
        // Use saved query if exists, otherwise use empty string (default search)
        const queryToUse = settings.taskQuery || '';
        tasksTabRef.value.loadTasks(queryToUse);
      }
    }, 100);
  }
});
</script>

<template>
  <div id="root">
    <div class="app-container">
      <TabNavigation v-model:activeTab="activeTab" />

      <TasksTab 
        v-if="activeTab === 'tasks'"
        ref="tasksTabRef"
        :initial-query="loadSettings().taskQuery || ''"
      />

      <SyncTab v-if="activeTab === 'sync'" />

      <SettingsTab 
        v-if="activeTab === 'settings'"
        @saved="handleSettingsSaved"
      />
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}
</style>
