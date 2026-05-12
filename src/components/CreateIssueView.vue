<script setup lang="ts">
import { useSettings } from '../composables/useSettings';
import { useCreateIssue } from '../composables/useCreateIssue';
import { useToast } from '../composables/useToast';
import TypeAhead from './TypeAhead.vue';
import type { YouTrackUser } from '../youtrack/client';
import type { YouTrackIssue } from '../youtrack/types';

const { hasValidSettings } = useSettings();

const {
  projects,
  projectsLoading,
  projectsError,
  selectedProjectId,
  summary,
  description,
  selectedAssigneeLogin,
  parentIssueId,
  linkedIssueIds,
  transformShapeId,
  isSubmitting,
  submitError,
  canSubmit,
  close,
  searchAssignees,
  searchIssuesByQuery,
  resolveUserByLogin,
  resolveIssueByKey,
  submit,
} = useCreateIssue();

const { show: showToast } = useToast();

function userKey(u: YouTrackUser) { return u.login; }
function userLabel(u: YouTrackUser) { return u.fullName || u.login; }
function userSub(u: YouTrackUser) { return `@${u.login}`; }

function issueKey(i: YouTrackIssue) { return i.idReadable; }
function issueLabel(i: YouTrackIssue) { return i.idReadable; }
function issueSub(i: YouTrackIssue) { return i.summary; }

function setAssignee(value: string | string[]) {
  selectedAssigneeLogin.value = Array.isArray(value) ? value[0] || '' : value;
}
function setParent(value: string | string[]) {
  parentIssueId.value = Array.isArray(value) ? value[0] || '' : value;
}
function setLinked(value: string | string[]) {
  linkedIssueIds.value = Array.isArray(value) ? [...value] : value ? [value] : [];
}

async function handleSubmit() {
  const id = await submit();
  if (id) {
    showToast('success', `Issue ${id} created and added to board`, 5000);
    close();
  }
}
</script>

<template>
  <div class="view">
    <header class="view-header">
      <button type="button" class="back" :disabled="isSubmitting" @click="close" aria-label="Back">‹ Back</button>
      <h2>Create YouTrack issue</h2>
    </header>

    <div v-if="!hasValidSettings" class="warning">
      YouTrack URL or token missing — open Settings, fill them in, then try again.
    </div>

    <div v-if="transformShapeId" class="info-banner">
      Selected shape on the board will become the new task card.
    </div>

    <div v-if="projectsError" class="error">{{ projectsError }}</div>

    <div class="form-grid">
      <div class="form-group">
        <label for="ci-project">Project:</label>
        <select id="ci-project" v-model="selectedProjectId" class="input" :disabled="projectsLoading">
          <option v-if="projectsLoading" value="">Loading…</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.name }} ({{ p.shortName }})</option>
        </select>
      </div>

      <div class="form-group">
        <label for="ci-summary">Summary <span class="required">*</span>:</label>
        <input id="ci-summary" v-model="summary" type="text" class="input" placeholder="Short summary" />
      </div>

      <div class="form-group form-group-full">
        <label for="ci-description">Description:</label>
        <textarea id="ci-description" v-model="description" class="input textarea" rows="15" placeholder="Markdown supported"></textarea>
      </div>

      <div class="form-group form-group-full">
        <label for="ci-assignee">Assignee:</label>
        <TypeAhead
          input-id="ci-assignee"
          :model-value="selectedAssigneeLogin"
          :search="searchAssignees"
          :item-key="userKey"
          :item-label="userLabel"
          :item-sub-label="userSub"
          :resolve-by-key="resolveUserByLogin"
          placeholder="Type to search users"
          @update:model-value="setAssignee"
        />
      </div>

      <div class="form-group form-group-full">
        <label for="ci-parent">Parent issue (subtask of):</label>
        <TypeAhead
          input-id="ci-parent"
          :model-value="parentIssueId"
          :search="searchIssuesByQuery"
          :item-key="issueKey"
          :item-label="issueLabel"
          :item-sub-label="issueSub"
          :resolve-by-key="resolveIssueByKey"
          placeholder="Search by id or summary"
          @update:model-value="setParent"
        />
      </div>

      <div class="form-group form-group-full">
        <label for="ci-links">Linked issues (relates to):</label>
        <TypeAhead
          input-id="ci-links"
          :multi="true"
          :model-value="linkedIssueIds"
          :search="searchIssuesByQuery"
          :item-key="issueKey"
          :item-label="issueLabel"
          :item-sub-label="issueSub"
          :resolve-by-key="resolveIssueByKey"
          placeholder="Search and select issues"
          @update:model-value="setLinked"
        />
      </div>
    </div>

    <div v-if="submitError" class="error">{{ submitError }}</div>

    <footer class="view-footer">
      <button class="button button-ghost" type="button" :disabled="isSubmitting" @click="close">Cancel</button>
      <button class="button button-primary" type="button" :disabled="!canSubmit" @click="handleSubmit">
        <span v-if="isSubmitting">Creating…</span>
        <span v-else>Create issue</span>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.view {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
}

.view-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.view-header h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--gray-900, #111827);
}

.back {
  background: transparent;
  border: 1px solid var(--gray-300, #d1d5db);
  color: var(--gray-700, #374151);
  border-radius: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 13px;
}

.back:hover:not(:disabled) {
  background: var(--gray-100, #f3f4f6);
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  position: relative;
}

.form-group-full {
  width: 100%;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 500;
  font-size: 13px;
  color: var(--gray-700, #374151);
}

.required { color: var(--red-600, #dc2626); }

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--gray-300, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
  background: #ffffff;
  font-family: inherit;
  box-sizing: border-box;
}

.input:focus {
  outline: none;
  border-color: var(--blue-500, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.textarea { resize: vertical; min-height: 240px; }

.error,
.warning,
.info-banner {
  padding: 8px 12px;
  border-radius: 6px;
  margin-bottom: 12px;
  font-size: 13px;
  border: 1px solid;
}

.error {
  background: var(--red-50, #fef2f2);
  color: var(--red-700, #b91c1c);
  border-color: var(--red-200, #fecaca);
}

.warning {
  background: var(--yellow-50, #fffbeb);
  color: var(--yellow-800, #92400e);
  border-color: var(--yellow-200, #fde68a);
}

.info-banner {
  background: #f0f9ff;
  color: #0c4a6e;
  border-color: #bae6fd;
}

.view-footer {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.button-primary { background: var(--blue-600, #2563eb); color: white; }
.button-primary:disabled { background: var(--gray-300, #d1d5db); color: var(--gray-500, #6b7280); cursor: not-allowed; }
.button-ghost { background: transparent; color: var(--gray-700, #374151); border: 1px solid var(--gray-300, #d1d5db); }
.button-ghost:hover:not(:disabled) { background: var(--gray-100, #f3f4f6); }
</style>
