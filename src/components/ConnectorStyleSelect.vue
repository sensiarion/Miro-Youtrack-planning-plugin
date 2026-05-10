<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue';
import {
  CONNECTOR_STROKE_STYLE_OPTIONS,
  CONNECTOR_END_CAP_OPTIONS,
  type ConnectorStrokeStyle,
  type ConnectorEndCap,
} from '../constants';

const props = defineProps<{
  strokeStyle: ConnectorStrokeStyle;
  endStrokeCap: ConnectorEndCap;
  strokeColor: string;
  strokeWidth: number;
}>();

const emit = defineEmits<{
  change: [value: { strokeStyle: ConnectorStrokeStyle; endStrokeCap: ConnectorEndCap }];
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

interface Option {
  line: ConnectorStrokeStyle;
  arrow: ConnectorEndCap;
  label: string;
}

const options = computed<Option[]>(() => {
  const out: Option[] = [];
  for (const ln of CONNECTOR_STROKE_STYLE_OPTIONS) {
    for (const ar of CONNECTOR_END_CAP_OPTIONS) {
      out.push({ line: ln.value, arrow: ar.value, label: `${ln.label} · ${ar.label}` });
    }
  }
  return out;
});

function dashFor(style: ConnectorStrokeStyle): string {
  if (style === 'dashed') return '8 4';
  if (style === 'dotted') return '2 4';
  return '0';
}

function toggle() {
  open.value = !open.value;
}
function close() {
  open.value = false;
}
function pick(opt: Option) {
  emit('change', { strokeStyle: opt.line, endStrokeCap: opt.arrow });
  close();
}

function onDocClick(e: MouseEvent) {
  if (!rootEl.value) return;
  if (!rootEl.value.contains(e.target as Node)) close();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

document.addEventListener('mousedown', onDocClick);
document.addEventListener('keydown', onKey);
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="rootEl" class="conn-select">
    <button
      type="button"
      class="conn-select-trigger"
      :aria-expanded="open"
      @click="toggle"
    >
      <svg class="preview" width="56" height="14" viewBox="0 0 80 20" aria-hidden="true">
        <line
          x1="2"
          y1="10"
          x2="68"
          y2="10"
          :stroke="strokeColor"
          :stroke-width="strokeWidth"
          :stroke-dasharray="dashFor(strokeStyle)"
          stroke-linecap="round"
        />
        <polygon
          v-if="endStrokeCap === 'stealth'"
          :points="'78,10 64,4 68,10 64,16'"
          :fill="strokeColor"
        />
        <polygon
          v-else-if="endStrokeCap === 'filled_arrow'"
          :points="'78,10 62,3 62,17'"
          :fill="strokeColor"
        />
        <circle
          v-else-if="endStrokeCap === 'rounded_stealth'"
          cx="74"
          cy="10"
          r="6"
          :fill="strokeColor"
        />
      </svg>
      <span class="caret" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="conn-select-menu" role="listbox">
      <button
        v-for="opt in options"
        :key="`${opt.line}-${opt.arrow}`"
        type="button"
        role="option"
        class="conn-option"
        :class="{ selected: opt.line === strokeStyle && opt.arrow === endStrokeCap }"
        :aria-selected="opt.line === strokeStyle && opt.arrow === endStrokeCap"
        @click="pick(opt)"
      >
        <svg width="80" height="20" viewBox="0 0 80 20" aria-hidden="true">
          <line
            x1="2"
            y1="10"
            x2="68"
            y2="10"
            :stroke="strokeColor"
            :stroke-width="strokeWidth"
            :stroke-dasharray="dashFor(opt.line)"
            stroke-linecap="round"
          />
          <polygon
            v-if="opt.arrow === 'stealth'"
            :points="'78,10 64,4 68,10 64,16'"
            :fill="strokeColor"
          />
          <polygon
            v-else-if="opt.arrow === 'filled_arrow'"
            :points="'78,10 62,3 62,17'"
            :fill="strokeColor"
          />
          <circle
            v-else-if="opt.arrow === 'rounded_stealth'"
            cx="74"
            cy="10"
            r="6"
            :fill="strokeColor"
          />
        </svg>
        <span class="label">{{ opt.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.conn-select {
  position: relative;
  display: inline-block;
}

.conn-select-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: #ffffff;
  border: 1px solid var(--gray-300, #d1d5db);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: var(--gray-700, #374151);
  min-height: 26px;
  font-family: inherit;
}

.conn-select-trigger:hover {
  border-color: var(--gray-400, #9ca3af);
}

.preview {
  display: block;
}

.caret {
  font-size: 11px;
  color: var(--gray-500, #6b7280);
}

.conn-select-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  background: #ffffff;
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
  z-index: 30;
  padding: 4px;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
}

.conn-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: var(--gray-700, #374151);
  text-align: left;
}

.conn-option:hover {
  background: var(--gray-100, #f3f4f6);
}

.conn-option.selected {
  background: #e0f2fe;
  color: #075985;
}

.label {
  white-space: nowrap;
}
</style>
