import { ref, computed } from 'vue';
import { loadSettings, saveSettings, type Settings } from '../storage';

const DEFAULT_SETTINGS: Settings = {
  youtrackBaseUrl: '',
  youtrackToken: '',
  taskQuery: '',
  syncQuery: '',
  statusFieldName: 'State',
};

// Shared state so all components see the same settings (singleton)
const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const youtrackBaseUrl = ref('');
const youtrackToken = ref('');
const statusFieldName = ref(DEFAULT_SETTINGS.statusFieldName);

const hasValidSettings = computed(() => {
  if (settings.value.youtrackBaseUrl && settings.value.youtrackToken) {
    return true;
  }
  return !!(youtrackBaseUrl.value && youtrackToken.value);
});

async function initSettings(): Promise<void> {
  const loaded = await loadSettings();
  settings.value = loaded;
  youtrackBaseUrl.value = loaded.youtrackBaseUrl;
  youtrackToken.value = loaded.youtrackToken;
  statusFieldName.value = loaded.statusFieldName;
}

async function saveSettingsData(): Promise<Partial<Settings>> {
  const newSettings: Partial<Settings> = {
    youtrackBaseUrl: youtrackBaseUrl.value,
    youtrackToken: youtrackToken.value,
    statusFieldName: statusFieldName.value,
  };
  await saveSettings(newSettings);
  settings.value = { ...settings.value, ...newSettings };
  return newSettings;
}

function getEffectiveSettings() {
  return {
    baseUrl: settings.value.youtrackBaseUrl || youtrackBaseUrl.value,
    token: settings.value.youtrackToken || youtrackToken.value,
    statusFieldName: settings.value.statusFieldName || statusFieldName.value,
  };
}

export function useSettings() {
  return {
    settings,
    youtrackBaseUrl,
    youtrackToken,
    statusFieldName,
    hasValidSettings,
    initSettings,
    saveSettingsData,
    getEffectiveSettings,
  };
}
