<script setup lang="ts">
import { computed, ref, onBeforeUnmount, nextTick } from 'vue';
import {
  CONNECTOR_STROKE_STYLE_OPTIONS,
  CONNECTOR_END_CAP_OPTIONS,
  type ConnectorStrokeStyle,
  type ConnectorEndCap,
} from '../constants';

defineProps<{
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
const menuEl = ref<HTMLElement | null>(null);
const menuStyle = ref<{ top: string; left: string; minWidth: string }>({
  top: '0px',
  left: '0px',
  minWidth: '220px',
});

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

function recomputePosition() {
  const trigger = rootEl.value?.querySelector('.conn-select-trigger') as HTMLElement | null;
  if (!trigger) return;
  const rect = trigger.getBoundingClientRect();
  const menuMaxHeight = 320;
  const margin = 4;
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < 200 && rect.top > 200;
  const top = placeAbove
    ? Math.max(margin, rect.top - menuMaxHeight - margin)
    : Math.min(window.innerHeight - margin, rect.bottom + margin);
  const left = Math.max(
    margin,
    Math.min(window.innerWidth - 240, rect.left),
  );
  menuStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    minWidth: `${Math.max(220, rect.width)}px`,
  };
}

async function toggle() {
  open.value = !open.value;
  if (open.value) {
    await nextTick();
    recomputePosition();
  }
}
function close() {
  open.value = false;
}
function pick(opt: Option) {
  emit('change', { strokeStyle: opt.line, endStrokeCap: opt.arrow });
  close();
}

function onDocClick(e: MouseEvent) {
  const target = e.target as Node;
  if (rootEl.value?.contains(target)) return;
  if (menuEl.value?.contains(target)) return;
  close();
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
function onScrollOrResize() {
  if (open.value) recomputePosition();
}

document.addEventListener('mousedown', onDocClick);
document.addEventListener('keydown', onKey);
window.addEventListener('resize', onScrollOrResize);
window.addEventListener('scroll', onScrollOrResize, true);
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKey);
  window.removeEventListener('resize', onScrollOrResize);
  window.removeEventListener('scroll', onScrollOrResize, true);
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

    <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      class="conn-select-menu"
      role="listbox"
      :style="menuStyle"
    >
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
    </Teleport>
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

</style>

<!-- Menu is teleported to body; styles must be global so scoped pruning skips them. -->
<style>
.conn-select-menu {
  position: fixed;
  background: #ffffff;
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  z-index: 9999;
  padding: 4px;
  display: flex;
  flex-direction: column;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
}

.conn-select-menu .conn-option {
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
  font-family: inherit;
}

.conn-select-menu .conn-option:hover {
  background: var(--gray-100, #f3f4f6);
}

.conn-select-menu .conn-option.selected {
  background: #e0f2fe;
  color: #075985;
}

.conn-select-menu .label {
  white-space: nowrap;
}
</style>
