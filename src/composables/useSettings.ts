import { ref, computed } from 'vue';
import { loadSettings, saveSettings, type Settings } from '../storage';

const DEFAULT_SETTINGS: Settings = {
  youtrackBaseUrl: '',
  youtrackToken: '',
  taskQuery: '',
  syncQuery: '',
  statusFieldName: 'State',
  stateColors: {},
};

// Shared state so all components see the same settings (singleton)
const settings = ref<Settings>({ ...DEFAULT_SETTINGS });
const youtrackBaseUrl = ref('');
const youtrackToken = ref('');
const statusFieldName = ref(DEFAULT_SETTINGS.statusFieldName);
const stateColors = ref<Record<string, string>>({});

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
  stateColors.value = loaded.stateColors ?? {};
}

async function saveSettingsData(): Promise<Partial<Settings>> {
  const newSettings: Partial<Settings> = {
    youtrackBaseUrl: youtrackBaseUrl.value,
    youtrackToken: youtrackToken.value,
    statusFieldName: statusFieldName.value,
    stateColors: stateColors.value,
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
    stateColors: stateColors.value,
  };
}

/** Update in-memory state colors (e.g. after sync merges new states). Call after saveSettings({ stateColors }). */
function updateStateColors(record: Record<string, string>): void {
  stateColors.value = record;
  settings.value = { ...settings.value, stateColors: record };
}

export function useSettings() {
  return {
    settings,
    youtrackBaseUrl,
    youtrackToken,
    statusFieldName,
    stateColors,
    hasValidSettings,
    initSettings,
    saveSettingsData,
    getEffectiveSettings,
    updateStateColors,
  };
}
