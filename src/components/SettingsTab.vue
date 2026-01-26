<script setup lang="ts">
import { useSettings } from '../composables/useSettings';

const { youtrackBaseUrl, youtrackToken, statusFieldName, saveSettingsData } = useSettings();

const emit = defineEmits<{
  saved: [];
}>();

async function handleSave() {
  await saveSettingsData();
  emit('saved');
}
</script>

<template>
  <div class="tab-content">
    <h2>Settings</h2>
    <div class="form-group">
      <label for="youtrack-url">YouTrack Instance URL:</label>
      <input 
        id="youtrack-url"
        v-model="youtrackBaseUrl"
        type="text"
        placeholder="https://youtrack.example.com"
        class="input"
      />
    </div>
    <div class="form-group">
      <label for="youtrack-token">YouTrack API Token:</label>
      <input 
        id="youtrack-token"
        v-model="youtrackToken"
        type="password"
        placeholder="Your permanent token"
        class="input"
      />
    </div>
    <div class="form-group">
      <label for="status-field">Status Field Name:</label>
      <input 
        id="status-field"
        v-model="statusFieldName"
        type="text"
        placeholder="State"
        class="input"
      />
      <small>Default: "State" - change if your YouTrack uses a different field name</small>
    </div>
    <button 
      class="button button-primary"
      @click="handleSave"
    >
      Save Settings
    </button>
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

small {
  display: block;
  color: var(--gray-500, #6b7280);
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
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
</style>
