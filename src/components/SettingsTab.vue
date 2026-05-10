<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSettings } from '../composables/useSettings';
import { useToast } from '../composables/useToast';
import ConnectorStyleSelect from './ConnectorStyleSelect.vue';
import CollapsibleSection from './CollapsibleSection.vue';
import {
  STATE_COLOR_PALETTE,
  CONNECTOR_COLOR_PALETTE,
  DEFAULT_CONNECTOR_STYLE,
  MIN_SYNC_CONCURRENCY,
  MAX_SYNC_CONCURRENCY,
  type ConnectorStyle,
} from '../constants';

const { settings, applySettings } = useSettings();

function displayLinkName(name: string): string {
  return settings.value.connectorLinkLabels[name] || name;
}

const emit = defineEmits<{
  saved: [];
}>();

const stateColorEntries = computed(() =>
  Object.entries(settings.value.stateColors).sort(([a], [b]) => a.localeCompare(b)),
);

const connectorStyleEntries = computed(() =>
  Object.entries(settings.value.connectorStyles).sort(([a], [b]) =>
    displayLinkName(a).localeCompare(displayLinkName(b)),
  ),
);

function setStateColor(stateName: string, color: string) {
  settings.value.stateColors = { ...settings.value.stateColors, [stateName]: color };
}

function patchConnectorStyle(linkType: string, patch: Partial<ConnectorStyle>) {
  const current = settings.value.connectorStyles[linkType] ?? { ...DEFAULT_CONNECTOR_STYLE };
  settings.value.connectorStyles = {
    ...settings.value.connectorStyles,
    [linkType]: { ...current, ...patch },
  };
}

function setStrokeColor(linkType: string, value: string) {
  patchConnectorStyle(linkType, { strokeColor: value });
}
function setStrokeWidth(linkType: string, value: number) {
  patchConnectorStyle(linkType, { strokeWidth: Math.max(1, Math.min(4, Math.round(value))) });
}

const isSaving = ref(false);
const { show: showToast } = useToast();

async function handleSave() {
  // Clamp concurrency before save
  if (settings.value.concurrency < MIN_SYNC_CONCURRENCY) settings.value.concurrency = MIN_SYNC_CONCURRENCY;
  if (settings.value.concurrency > MAX_SYNC_CONCURRENCY) settings.value.concurrency = MAX_SYNC_CONCURRENCY;
  isSaving.value = true;
  try {
    await applySettings({
      youtrackBaseUrl: settings.value.youtrackBaseUrl,
      youtrackToken: settings.value.youtrackToken,
      statusFieldName: settings.value.statusFieldName,
      stateColors: settings.value.stateColors,
      connectorStyles: settings.value.connectorStyles,
      concurrency: settings.value.concurrency,
      deleteMissingOnSync: settings.value.deleteMissingOnSync,
    });
    showToast('success', 'Settings saved');
    emit('saved');
  } catch (e: any) {
    showToast('error', e?.message || 'Failed to save settings', 4000);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="tab-content">
    <h2>Settings</h2>

    <CollapsibleSection
      title="Connection"
      :default-open="true"
      storage-key="youtrack-plan-mindmap:settings.connection"
    >
      <div class="form-group">
        <label for="youtrack-url">YouTrack Instance URL:</label>
        <input
          id="youtrack-url"
          v-model="settings.youtrackBaseUrl"
          type="text"
          placeholder="https://youtrack.example.com"
          class="input"
        />
      </div>
      <div class="form-group">
        <label for="youtrack-token">YouTrack API Token:</label>
        <input
          id="youtrack-token"
          v-model="settings.youtrackToken"
          type="password"
          placeholder="Your permanent token"
          class="input"
        />
        <small>Stored locally on your device (lightly obfuscated). Not synced to the board.</small>
      </div>
      <div class="form-group">
        <label for="status-field">Status Field Name:</label>
        <input
          id="status-field"
          v-model="settings.statusFieldName"
          type="text"
          placeholder="State"
          class="input"
        />
        <small>Default: "State" — change if your YouTrack uses a different field name.</small>
      </div>
    </CollapsibleSection>

    <CollapsibleSection
      title="Sync"
      storage-key="youtrack-plan-mindmap:settings.sync"
    >
      <div class="form-group">
        <label for="sync-concurrency">Sync concurrency:</label>
        <input
          id="sync-concurrency"
          v-model.number="settings.concurrency"
          type="number"
          :min="MIN_SYNC_CONCURRENCY"
          :max="MAX_SYNC_CONCURRENCY"
          class="input input-narrow"
        />
        <small>Parallel requests during sync (1–10). Higher = faster but more load on YouTrack.</small>
      </div>

      <div class="form-group form-group-checkbox">
        <label class="checkbox-label">
          <input v-model="settings.deleteMissingOnSync" type="checkbox" />
          <span>Delete cards not found by sync query</span>
        </label>
        <small>Destructive: removes plugin-managed cards on the board whose issue is not in current sync results. Off by default.</small>
      </div>
    </CollapsibleSection>

    <CollapsibleSection
      title="Appearance"
      storage-key="youtrack-plan-mindmap:settings.appearance"
    >
      <div class="form-group">
        <label>Task state colors</label>
        <small class="form-hint">Colors for task states on board cards. Run a sync to discover states from YouTrack.</small>
        <div v-if="stateColorEntries.length === 0" class="state-colors-empty">
          Run a sync to see and customize state colors.
        </div>
        <div v-else class="state-colors-list">
          <div
            v-for="[stateName, currentColor] in stateColorEntries"
            :key="stateName"
            class="state-color-row"
          >
            <span class="state-name">{{ stateName }}</span>
            <div class="palette-swatches">
              <button
                v-for="paletteColor in STATE_COLOR_PALETTE"
                :key="paletteColor"
                type="button"
                class="swatch"
                :class="{ 'swatch-selected': currentColor === paletteColor }"
                :style="{ backgroundColor: paletteColor }"
                :title="paletteColor"
                @click="setStateColor(stateName, paletteColor)"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Connector styles by link type</label>
        <small class="form-hint">Per YouTrack link type: line style, end arrow, color. Run a sync to discover link types.</small>
        <div v-if="connectorStyleEntries.length === 0" class="state-colors-empty">
          Run a sync to see and customize connector styles.
        </div>
        <div v-else class="connector-styles-list">
          <div
            v-for="[linkType, style] in connectorStyleEntries"
            :key="linkType"
            class="connector-row"
          >
            <div class="connector-row-header">
              <span class="link-type-name">{{ displayLinkName(linkType) }}</span>
              <span v-if="settings.connectorLinkLabels[linkType]" class="link-type-internal">{{ linkType }}</span>
            </div>
            <div class="connector-controls">
              <label class="ctrl">
                <span>Style</span>
                <ConnectorStyleSelect
                  :stroke-style="style.strokeStyle"
                  :end-stroke-cap="style.endStrokeCap"
                  :stroke-color="style.strokeColor"
                  :stroke-width="style.strokeWidth"
                  @change="(v) => patchConnectorStyle(linkType, v)"
                />
              </label>
              <label class="ctrl ctrl-narrow">
                <span>Width</span>
                <input
                  type="number"
                  min="1"
                  max="4"
                  :value="style.strokeWidth"
                  class="input input-narrow"
                  @input="setStrokeWidth(linkType, Number(($event.target as HTMLInputElement).value))"
                />
              </label>
              <div class="ctrl ctrl-color">
                <span>Color</span>
                <div class="palette-swatches">
                  <button
                    v-for="paletteColor in CONNECTOR_COLOR_PALETTE"
                    :key="paletteColor"
                    type="button"
                    class="swatch"
                    :class="{ 'swatch-selected': style.strokeColor === paletteColor }"
                    :style="{ backgroundColor: paletteColor }"
                    :title="paletteColor"
                    @click="setStrokeColor(linkType, paletteColor)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>

    <button
      class="button button-primary"
      :disabled="isSaving"
      @click="handleSave"
    >
      <span v-if="isSaving">Saving…</span>
      <span v-else>Save Settings</span>
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

.form-group-checkbox {
  margin-bottom: 16px;
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: 8px;
  font-weight: 500 !important;
  margin-bottom: 4px !important;
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

.input-narrow {
  width: 80px;
}

.input-select {
  width: auto;
  min-width: 110px;
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

.form-hint {
  margin-bottom: 8px;
}

.state-colors-empty {
  color: var(--gray-500, #6b7280);
  font-size: 13px;
  padding: 12px 0;
}

.state-colors-list,
.connector-styles-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.state-color-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.state-name,
.link-type-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-700, #374151);
  min-width: 120px;
}

.link-type-internal {
  font-size: 11px;
  color: var(--gray-500, #6b7280);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--gray-100, #f3f4f6);
  padding: 2px 6px;
  border-radius: 4px;
}

.palette-swatches {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.swatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: border-color 0.2s, transform 0.15s;
}

.swatch:hover {
  transform: scale(1.1);
}

.swatch-selected {
  border-color: var(--gray-900, #111827);
  box-shadow: 0 0 0 1px var(--gray-400, #9ca3af);
}

.connector-row {
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 6px;
  padding: 6px 8px;
  background: var(--gray-50, #f9fafb);
}

.connector-row-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.connector-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.ctrl {
  display: flex !important;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  margin: 0 !important;
  font-size: 11px;
  color: var(--gray-600, #4b5563);
  font-weight: 500 !important;
}

.ctrl > span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--gray-500, #6b7280);
}

.ctrl-narrow input.input-narrow {
  width: 44px;
  padding: 2px 6px;
  font-size: 12px;
  height: 24px;
  margin-bottom: 0;
  box-sizing: border-box;
}

.ctrl-color {
  align-items: center;
}

.ctrl-color .palette-swatches .swatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border-width: 1px;
}

.ctrl-color .palette-swatches .swatch-selected {
  border-width: 2px;
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

.save-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}

.status-success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.status-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}
</style>
