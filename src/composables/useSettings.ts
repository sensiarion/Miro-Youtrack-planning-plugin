import { ref, computed } from 'vue';
import { loadSettings, saveSettings, type Settings } from '../storage';

export function useSettings() {
  const settings = ref<Settings>(loadSettings());
  
  // Settings form state
  const youtrackBaseUrl = ref(settings.value.youtrackBaseUrl);
  const youtrackToken = ref(settings.value.youtrackToken);
  const statusFieldName = ref(settings.value.statusFieldName);

  // Computed - check both refs (for real-time validation) and saved settings (for cross-tab sync)
  const hasValidSettings = computed(() => {
    // Check if settings are saved and valid
    if (settings.value.youtrackBaseUrl && settings.value.youtrackToken) {
      return true;
    }
    // Also check current form values (for when user is typing but hasn't saved yet)
    return !!(youtrackBaseUrl.value && youtrackToken.value);
  });

  async function saveSettingsData() {
    const newSettings: Partial<Settings> = {
      youtrackBaseUrl: youtrackBaseUrl.value,
      youtrackToken: youtrackToken.value,
      statusFieldName: statusFieldName.value,
    };
    saveSettings(newSettings);
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

  return {
    settings,
    youtrackBaseUrl,
    youtrackToken,
    statusFieldName,
    hasValidSettings,
    saveSettingsData,
    getEffectiveSettings,
  };
}
