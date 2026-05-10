<script setup lang="ts">
import { ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  title: string;
  defaultOpen?: boolean;
  storageKey?: string;
}>(), {
  defaultOpen: false,
});

const open = ref(props.defaultOpen);

if (props.storageKey) {
  try {
    const stored = localStorage.getItem(props.storageKey);
    if (stored === '1') open.value = true;
    else if (stored === '0') open.value = false;
  } catch {
    /* ignore */
  }
}

watch(open, (val) => {
  if (props.storageKey) {
    try {
      localStorage.setItem(props.storageKey, val ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
});

function toggle() {
  open.value = !open.value;
}
</script>

<template>
  <section class="collapsible" :class="{ open }">
    <button type="button" class="header" :aria-expanded="open" @click="toggle">
      <span class="chevron">{{ open ? '▾' : '▸' }}</span>
      <span class="title">{{ title }}</span>
    </button>
    <div v-if="open" class="body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.collapsible {
  border: 1px solid var(--gray-200, #e5e7eb);
  border-radius: 8px;
  margin-bottom: 12px;
  background: #ffffff;
  overflow: hidden;
}

.collapsible.open {
  border-color: var(--gray-300, #d1d5db);
}

.header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: var(--gray-50, #f9fafb);
  border: none;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--gray-800, #1f2937);
  text-align: left;
}

.header:hover {
  background: var(--gray-100, #f3f4f6);
}

.collapsible.open .header {
  border-bottom: 1px solid var(--gray-200, #e5e7eb);
}

.chevron {
  font-size: 11px;
  width: 12px;
  display: inline-block;
  color: var(--gray-500, #6b7280);
}

.title {
  flex: 1;
}

.body {
  padding: 12px;
}
</style>
