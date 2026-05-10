import { ref, computed } from 'vue';
import { loadSettings, loadLocalCredentials, saveSettings, type Settings } from '../storage';
import { DEFAULT_SYNC_CONCURRENCY } from '../constants';

const DEFAULT_SETTINGS: Settings = {
  youtrackBaseUrl: '',
  youtrackToken: '',
  taskQuery: '',
  syncQuery: '',
  statusFieldName: 'State',
  stateColors: {},
  connectorStyles: {},
  connectorLinkLabels: {},
  concurrency: DEFAULT_SYNC_CONCURRENCY,
  deleteMissingOnSync: false,
};

// Single source of truth shared across components.
const settings = ref<Settings>({ ...DEFAULT_SETTINGS });

const hasValidSettings = computed(
  () => !!(settings.value.youtrackBaseUrl && settings.value.youtrackToken),
);

async function initSettings(): Promise<void> {
  // Surface URL + token from localStorage synchronously so search/sync work even if
  // Miro board storage is slow.
  const local = loadLocalCredentials();
  settings.value = { ...settings.value, ...local };

  try {
    const loaded = await loadSettings();
    settings.value = loaded;
  } catch (e) {
    console.warn('Board settings load failed; using local credentials only:', e);
  }
}

/** Persist a partial settings update and reflect it in the in-memory `settings` ref. */
async function applySettings(patch: Partial<Settings>): Promise<void> {
  await saveSettings(patch);
  settings.value = { ...settings.value, ...patch };
}

export function useSettings() {
  return {
    settings,
    hasValidSettings,
    initSettings,
    applySettings,
  };
}
