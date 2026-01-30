<script setup lang="ts">
import { YouTrackIssue } from '../youtrack/types';

interface Props {
  issue: YouTrackIssue;
  draggable?: boolean;
  clickable?: boolean;
  onBoardCount?: number;
}

const props = withDefaults(defineProps<Props>(), {
  draggable: false,
  clickable: false,
  onBoardCount: 0,
});

const emit = defineEmits<{
  (e: 'click'): void;
  (e: 'navigate-to-board', issueId: string): void;
}>();

/**
 * Get contrast color (black or white) for a given background color
 */
function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}
</script>

<template>
  <div 
    :class="[
      'task-item',
      { 'miro-draggable mindmap-card': draggable, 'task-item-clickable': clickable }
    ]"
    :data-issue="draggable ? JSON.stringify(issue) : undefined"
    @click="clickable ? emit('click') : undefined"
  >
    <div class="task-header">
      <div class="task-id">{{ issue.idReadable }}</div>
      <div class="task-header-right">
        <a 
          :href="issue.url" 
          target="_blank" 
          class="task-link-icon"
          title="Open in YouTrack"
          @click.stop
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3.33333V8M12 8L9.33333 5.33333M12 8L9.33333 10.6667M8 12.6667H3.33333C2.59695 12.6667 2 12.0697 2 11.3333V4.66667C2 3.93029 2.59695 3.33333 3.33333 3.33333H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <button
          v-if="onBoardCount > 0"
          type="button"
          class="on-board-badge"
          :title="`${onBoardCount} on board – click to go`"
          @click.stop="emit('navigate-to-board', issue.idReadable)"
        >
          x{{ onBoardCount }}
        </button>
      </div>
    </div>
    <div class="task-summary">{{ issue.summary }}</div>
    <div class="task-meta">
      <span v-if="issue.stateNameLocalized || issue.stateName" class="task-state">
        {{ issue.stateNameLocalized || issue.stateName }}
      </span>
      <span v-if="issue.assignee !== 'Unassigned'" class="task-assignee">
        👤 {{ issue.assignee }}
      </span>
    </div>
    <div v-if="issue.tags.length > 0" class="task-tags-container">
      <span 
        v-for="tag in issue.tags" 
        :key="tag.name"
        class="task-tag"
        :style="tag.color ? { backgroundColor: tag.color, color: getContrastColor(tag.color) } : {}"
      >
        {{ tag.name }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.task-item {
  padding: 16px;
  border: 2px solid var(--gray-200, #e5e7eb);
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: grab;
  background: white;
  transition: all 0.2s;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.task-item-clickable {
  cursor: pointer;
}

.mindmap-card {
  border-radius: 16px;
  border-width: 2px;
  position: relative;
}

.task-item:hover {
  border-color: var(--blue-400, #60a5fa);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.task-item:active {
  cursor: grabbing;
  transform: translateY(0);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-id {
  font-weight: 700;
  color: var(--blue-600, #2563eb);
  font-size: 15px;
  letter-spacing: -0.02em;
}

.task-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.on-board-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  background: var(--red-100, #fee2e2);
  color: var(--red-700, #b91c1c);
  border: 1px solid var(--red-300, #fca5a5);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.on-board-badge:hover {
  background: var(--red-200, #fecaca);
  color: var(--red-800, #991b1b);
}

.task-link-icon {
  color: var(--gray-500, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.task-link-icon:hover {
  color: var(--blue-600, #2563eb);
  background: var(--blue-50, #eff6ff);
}

.task-summary {
  margin-bottom: 10px;
  color: var(--gray-900, #111827);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;
}

.task-meta {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--gray-600, #4b5563);
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.task-state {
  padding: 4px 10px;
  background: var(--gray-100, #f3f4f6);
  border-radius: 6px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-assignee {
  padding: 4px 10px;
  background: var(--blue-50, #eff6ff);
  border-radius: 6px;
  color: var(--blue-700, #1d4ed8);
  font-weight: 500;
  font-size: 11px;
  display: inline-block;
}

.task-assignee-unassigned {
  background: var(--gray-100, #f3f4f6);
  color: var(--gray-500, #6b7280);
  font-style: italic;
}

.task-tags-container {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.task-tag {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background-color: var(--gray-100, #f3f4f6);
  color: var(--gray-700, #374151);
  display: inline-block;
}
</style>
