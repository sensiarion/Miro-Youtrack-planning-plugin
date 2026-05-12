<script setup lang="ts">
import { useToast } from '../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <div class="toast-container" aria-live="polite">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="`toast-${toast.kind}`"
      @click="dismiss(toast.id)"
    >
      <span class="icon">
        <span v-if="toast.kind === 'success'">✓</span>
        <span v-else-if="toast.kind === 'error'">!</span>
        <span v-else>i</span>
      </span>
      <span class="message">{{ toast.message }}</span>
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: 56px;
  right: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 2000;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  pointer-events: auto;
  cursor: pointer;
  max-width: 320px;
  animation: slidein 0.18s ease-out;
}

.toast-success {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #bbf7d0;
}

.toast-error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.toast-info {
  background: #eff6ff;
  color: #1d4ed8;
  border: 1px solid #bfdbfe;
}

.icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: currentColor;
  color: #ffffff;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.toast-success .icon {
  color: #166534;
}
.toast-success .icon > span { color: #ffffff; }
.toast-error .icon { color: #991b1b; }
.toast-error .icon > span { color: #ffffff; }
.toast-info .icon { color: #1d4ed8; }
.toast-info .icon > span { color: #ffffff; }

.message {
  line-height: 1.3;
}

@keyframes slidein {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
