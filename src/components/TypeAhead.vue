<script setup lang="ts" generic="T">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string | string[];
  multi?: boolean;
  search: (query: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  itemLabel: (item: T) => string;
  itemSubLabel?: (item: T) => string | null;
  placeholder?: string;
  resolveByKey?: (key: string) => Promise<T | null>;
  inputId?: string;
  disabled?: boolean;
}>(), {
  multi: false,
  placeholder: '',
  disabled: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | string[]];
}>();

const query = ref('');
const options = ref<T[]>([]);
const isOpen = ref(false);
const isLoading = ref(false);
const selectedItems = ref<T[]>([]); // resolved labels for chips
const wrapperEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let blurTimer: ReturnType<typeof setTimeout> | null = null;

async function refreshSelectedFromModel() {
  if (!props.resolveByKey) return;
  const keys = props.multi
    ? (props.modelValue as string[])
    : props.modelValue
      ? [props.modelValue as string]
      : [];
  const known = new Map<string, T>();
  for (const it of selectedItems.value) known.set(props.itemKey(it), it);
  const resolved: T[] = [];
  for (const k of keys) {
    if (known.has(k)) {
      resolved.push(known.get(k)!);
      continue;
    }
    try {
      const item = await props.resolveByKey(k);
      if (item) resolved.push(item);
    } catch {
      /* ignore */
    }
  }
  selectedItems.value = resolved;
}

watch(() => props.modelValue, () => {
  void refreshSelectedFromModel();
}, { immediate: true });

function emitSingle(key: string) {
  emit('update:modelValue', key);
}

function emitMulti(keys: string[]) {
  emit('update:modelValue', keys);
}

function selectedKeys(): string[] {
  if (props.multi) return [...(props.modelValue as string[])];
  return props.modelValue ? [props.modelValue as string] : [];
}

async function runSearch() {
  isLoading.value = true;
  try {
    options.value = await props.search(query.value);
  } finally {
    isLoading.value = false;
  }
}

function onInput(value: string) {
  query.value = value;
  isOpen.value = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void runSearch();
  }, 250);
}

function pick(item: T) {
  const key = props.itemKey(item);
  if (props.multi) {
    const current = selectedKeys();
    if (current.includes(key)) {
      // remove if already present
      const next = current.filter(k => k !== key);
      emitMulti(next);
    } else {
      emitMulti([...current, key]);
    }
    query.value = '';
    nextTick(() => inputEl.value?.focus());
  } else {
    emitSingle(key);
    selectedItems.value = [item];
    query.value = props.itemLabel(item);
    isOpen.value = false;
    inputEl.value?.blur();
  }
}

function removeChip(key: string) {
  if (props.multi) {
    emitMulti(selectedKeys().filter(k => k !== key));
  } else {
    emitSingle('');
    selectedItems.value = [];
    query.value = '';
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Backspace' && !query.value && props.multi) {
    const current = selectedKeys();
    if (current.length > 0) {
      emitMulti(current.slice(0, -1));
    }
  } else if (e.key === 'Escape') {
    isOpen.value = false;
    inputEl.value?.blur();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (options.value.length > 0) pick(options.value[0]);
  }
}

function onFocus() {
  if (blurTimer) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  isOpen.value = true;
  // Pre-load options if empty query produces results
  if (options.value.length === 0 && !isLoading.value) {
    void runSearch();
  }
}

function onBlur() {
  // Delay so click on option still fires
  if (blurTimer) clearTimeout(blurTimer);
  blurTimer = setTimeout(() => {
    isOpen.value = false;
  }, 150);
}

function onDocClick(e: MouseEvent) {
  if (!wrapperEl.value) return;
  if (!wrapperEl.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

document.addEventListener('mousedown', onDocClick);
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick);
  if (debounceTimer) clearTimeout(debounceTimer);
  if (blurTimer) clearTimeout(blurTimer);
});
</script>

<template>
  <div ref="wrapperEl" class="ta-wrapper">
    <div class="ta-control" :class="{ disabled: disabled }">
      <span
        v-for="item in selectedItems"
        :key="itemKey(item)"
        class="ta-chip"
      >
        {{ itemLabel(item) }}
        <button
          type="button"
          class="ta-chip-x"
          aria-label="Remove"
          @click.stop.prevent="removeChip(itemKey(item))"
          @mousedown.prevent
        >×</button>
      </span>
      <input
        :id="inputId"
        ref="inputEl"
        type="text"
        class="ta-input"
        :placeholder="selectedItems.length > 0 && multi ? '' : placeholder"
        :value="query"
        :disabled="disabled"
        autocomplete="off"
        @input="onInput(($event.target as HTMLInputElement).value)"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="onKey"
      />
    </div>
    <ul v-if="isOpen" class="ta-menu" role="listbox">
      <li v-if="isLoading" class="ta-info">Searching…</li>
      <li v-else-if="options.length === 0" class="ta-info">No matches</li>
      <li
        v-for="opt in options"
        v-else
        :key="itemKey(opt)"
        class="ta-option"
        :class="{ 'ta-option-selected': selectedKeys().includes(itemKey(opt)) }"
        role="option"
        @mousedown.prevent="pick(opt)"
      >
        <strong>{{ itemLabel(opt) }}</strong>
        <span v-if="itemSubLabel && itemSubLabel(opt)" class="ta-sublabel">
          {{ itemSubLabel(opt) }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ta-wrapper {
  position: relative;
}

.ta-control {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid var(--gray-300, #d1d5db);
  border-radius: 6px;
  background: #ffffff;
  min-height: 36px;
  align-items: center;
  cursor: text;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.ta-control:focus-within {
  border-color: var(--blue-500, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.ta-control.disabled {
  background: var(--gray-100, #f3f4f6);
}

.ta-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--blue-50, #eff6ff);
  color: var(--blue-700, #1d4ed8);
  border: 1px solid var(--blue-200, #bfdbfe);
  border-radius: 999px;
  padding: 2px 4px 2px 10px;
  font-size: 12px;
  font-weight: 500;
}

.ta-chip-x {
  background: transparent;
  border: none;
  color: var(--blue-700, #1d4ed8);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0 4px;
  border-radius: 50%;
}

.ta-chip-x:hover {
  background: var(--blue-100, #dbeafe);
}

.ta-input {
  flex: 1;
  min-width: 80px;
  border: none;
  outline: none;
  font-size: 14px;
  padding: 4px;
  background: transparent;
}

.ta-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: #ffffff;
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
  list-style: none;
  margin: 0;
  padding: 4px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 20;
}

.ta-info {
  padding: 8px 10px;
  font-size: 13px;
  color: var(--gray-500, #6b7280);
}

.ta-option {
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.ta-option:hover {
  background: var(--gray-100, #f3f4f6);
}

.ta-option-selected {
  background: var(--blue-50, #eff6ff);
}

.ta-sublabel {
  color: var(--gray-500, #6b7280);
  font-size: 12px;
}
</style>
