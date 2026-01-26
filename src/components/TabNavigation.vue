<script setup lang="ts">
interface Props {
  activeTab: 'tasks' | 'sync' | 'settings';
}

interface Emits {
  (e: 'update:activeTab', value: 'tasks' | 'sync' | 'settings'): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function setActiveTab(tab: 'tasks' | 'sync' | 'settings') {
  emit('update:activeTab', tab);
}
</script>

<template>
  <div class="tabs">
    <button 
      :class="['tab', { active: activeTab === 'tasks' }]"
      @click="setActiveTab('tasks')"
    >
      Tasks
    </button>
    <button 
      :class="['tab', { active: activeTab === 'sync' }]"
      @click="setActiveTab('sync')"
    >
      Sync
    </button>
    <button 
      :class="['tab', { active: activeTab === 'settings' }]"
      @click="setActiveTab('settings')"
    >
      Settings
    </button>
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  border-bottom: 1px solid var(--gray-200, #e5e7eb);
  background: var(--gray-50, #f9fafb);
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 12px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-600, #4b5563);
  transition: all 0.2s;
  white-space: nowrap;
}

.tab:hover {
  background: var(--gray-100, #f3f4f6);
  color: var(--gray-900, #111827);
}

.tab.active {
  color: var(--blue-600, #2563eb);
  border-bottom-color: var(--blue-600, #2563eb);
  font-weight: 600;
  background: #ffffff;
}

@media (max-width: 768px) {
  .tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .tab {
    min-width: 80px;
  }
}
</style>
