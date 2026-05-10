import { ref, computed } from 'vue';
import { useSettings } from './useSettings';
import {
  listProjects,
  listUsers,
  createIssue,
  addIssueLink,
  fetchIssueById,
  searchIssues,
  type YouTrackProject,
  type YouTrackUser,
} from '../youtrack/client';
import { LOCAL_STORAGE_KEYS, METADATA_KEY, TASK_FILL_OPACITY } from '../constants';
import { buildTaskMindmapContent, getTaskColor } from '../miro/taskShape';
import type { YouTrackIssue } from '../youtrack/types';

interface OpenOptions {
  parentIssueId?: string;
  linkedIssueIds?: string[];
  summary?: string;
  /** If provided, after creation the board shape with this id is transformed into a plugin-managed task card instead of creating a new card. */
  transformShapeId?: string;
}

const isOpen = ref(false);
const projects = ref<YouTrackProject[]>([]);
const projectsLoading = ref(false);
const projectsError = ref<string | null>(null);

const selectedProjectId = ref('');
const summary = ref('');
const description = ref('');

const selectedAssigneeLogin = ref('');
const parentIssueId = ref('');
const linkedIssueIds = ref<string[]>([]);
const transformShapeId = ref<string | null>(null);

const isSubmitting = ref(false);
const submitError = ref<string | null>(null);

export function useCreateIssue() {
  const { settings } = useSettings();

  const canSubmit = computed(
    () => !!selectedProjectId.value && summary.value.trim().length > 0 && !isSubmitting.value,
  );

  function reset(): void {
    summary.value = '';
    description.value = '';
    selectedAssigneeLogin.value = '';
    parentIssueId.value = '';
    linkedIssueIds.value = [];
    transformShapeId.value = null;
    submitError.value = null;
  }

  async function loadProjects(): Promise<void> {
    const baseUrl = settings.value.youtrackBaseUrl;
    const token = settings.value.youtrackToken;
    if (!baseUrl || !token) {
      projectsError.value = 'Configure YouTrack URL and token in Settings first';
      projects.value = [];
      return;
    }
    projectsLoading.value = true;
    projectsError.value = null;
    try {
      const list = await listProjects(baseUrl, token);
      projects.value = list;
      const last = localStorage.getItem(LOCAL_STORAGE_KEYS.LAST_PROJECT) ?? '';
      if (last && list.some(p => p.id === last)) {
        selectedProjectId.value = last;
      } else if (list.length > 0 && !selectedProjectId.value) {
        selectedProjectId.value = list[0].id;
      }
    } catch (e: any) {
      projectsError.value = e?.message || 'Failed to load projects';
    } finally {
      projectsLoading.value = false;
    }
  }

  async function open(opts: OpenOptions = {}): Promise<void> {
    reset();
    if (opts.parentIssueId) parentIssueId.value = opts.parentIssueId;
    if (opts.linkedIssueIds && opts.linkedIssueIds.length > 0) {
      linkedIssueIds.value = [...opts.linkedIssueIds];
    }
    if (opts.summary) summary.value = opts.summary;
    if (opts.transformShapeId) transformShapeId.value = opts.transformShapeId;
    isOpen.value = true;
    if (projects.value.length === 0) {
      await loadProjects();
    }
  }

  function close(): void {
    isOpen.value = false;
  }

  async function searchAssignees(query: string): Promise<YouTrackUser[]> {
    const baseUrl = settings.value.youtrackBaseUrl;
    const token = settings.value.youtrackToken;
    if (!baseUrl || !token) return [];
    try {
      return await listUsers(baseUrl, token, query);
    } catch (e) {
      console.warn('User lookup failed:', e);
      return [];
    }
  }

  async function searchIssuesByQuery(query: string): Promise<YouTrackIssue[]> {
    const baseUrl = settings.value.youtrackBaseUrl;
    const token = settings.value.youtrackToken;
    if (!baseUrl || !token) return [];
    const trimmed = (query || '').trim();
    const searchQuery = trimmed || 'sort by: updated desc';
    try {
      const issues = await searchIssues({
        baseUrl,
        token,
        query: searchQuery,
        statusFieldName: settings.value.statusFieldName,
      });
      return issues.slice(0, 15);
    } catch (e) {
      console.warn('Issue search failed:', e);
      return [];
    }
  }

  async function resolveUserByLogin(login: string): Promise<YouTrackUser | null> {
    if (!login) return null;
    const baseUrl = settings.value.youtrackBaseUrl;
    const token = settings.value.youtrackToken;
    if (!baseUrl || !token) return { id: login, login, fullName: login };
    try {
      const matches = await listUsers(baseUrl, token, login);
      const exact = matches.find(u => u.login === login);
      return exact ?? (matches[0] ?? null);
    } catch {
      return { id: login, login, fullName: login };
    }
  }

  async function resolveIssueByKey(key: string): Promise<YouTrackIssue | null> {
    if (!key) return null;
    const baseUrl = settings.value.youtrackBaseUrl;
    const token = settings.value.youtrackToken;
    if (!baseUrl || !token) return null;
    try {
      return await fetchIssueById(baseUrl, token, key, settings.value.statusFieldName);
    } catch (e) {
      console.warn('Issue lookup failed:', e);
      return null;
    }
  }

  /**
   * Replace an existing board shape's content/style with the new task card data,
   * keeping the original position/size. Marks it with plugin metadata so future
   * syncs treat it as a regular task card.
   */
  function metadataPayload(issue: YouTrackIssue) {
    return {
      issueId: issue.idReadable,
      issueUrl: issue.url,
      summary: issue.summary,
      stateName: issue.stateName,
      stateNameLocalized: issue.stateNameLocalized,
      tags: issue.tags.map(t => ({ name: t.name, color: t.color })),
      assignee: issue.assignee,
    };
  }

  async function transformShapeIntoTask(shapeId: string, idReadable: string): Promise<void> {
    const issue = await fetchIssueById(
      settings.value.youtrackBaseUrl,
      settings.value.youtrackToken,
      idReadable,
      settings.value.statusFieldName,
    );
    if (!issue) return;

    const fetched = await miro.board.get({ id: shapeId });
    const items = Array.isArray(fetched) ? fetched : [fetched];
    if (items.length === 0) return;
    const shape = items[0] as any;
    if (!shape) return;

    const stateKey = issue.stateNameLocalized || issue.stateName;
    const color = getTaskColor(stateKey, settings.value.stateColors, issue.stateName);
    const content = buildTaskMindmapContent(issue);

    if ('content' in shape) shape.content = content;
    if (shape.style && typeof shape.style === 'object') {
      shape.style.fillColor = color;
      shape.style.color = '#000000';
    }
    shape.linkedTo = issue.url;
    try {
      await shape.sync();
    } catch (e) {
      console.warn('Could not sync transformed shape:', e);
    }
    await shape.setMetadata(METADATA_KEY, metadataPayload(issue) as any);
  }

  async function placeNewIssueOnBoard(idReadable: string): Promise<void> {
    const issue = await fetchIssueById(
      settings.value.youtrackBaseUrl,
      settings.value.youtrackToken,
      idReadable,
      settings.value.statusFieldName,
    );
    if (!issue) return;

    const viewport = await miro.board.viewport.get();
    const centerX = viewport.x + viewport.width / 2;
    const centerY = viewport.y + viewport.height / 2;

    const stateKey = issue.stateNameLocalized || issue.stateName;
    const color = getTaskColor(stateKey, settings.value.stateColors, issue.stateName);
    const content = buildTaskMindmapContent(issue);

    const node = await miro.board.experimental.createMindmapNode({
      nodeView: {
        type: 'shape',
        shape: 'round_rectangle',
        content,
        style: {
          color,
          fillOpacity: TASK_FILL_OPACITY,
          fontSize: 14,
          borderStyle: 'normal',
        },
      },
      x: centerX,
      y: centerY,
    });
    node.linkedTo = issue.url;
    await node.sync();
    await node.setMetadata(METADATA_KEY, metadataPayload(issue) as any);
  }

  async function submit(): Promise<string | null> {
    if (!canSubmit.value) return null;
    const baseUrl = settings.value.youtrackBaseUrl;
    const token = settings.value.youtrackToken;
    if (!baseUrl || !token) {
      submitError.value = 'Configure YouTrack URL and token in Settings first';
      return null;
    }

    isSubmitting.value = true;
    submitError.value = null;
    try {
      const created = await createIssue(baseUrl, token, {
        projectId: selectedProjectId.value,
        summary: summary.value.trim(),
        description: description.value.trim() || undefined,
        assigneeLogin: selectedAssigneeLogin.value || undefined,
      });

      // Remember last project per user
      try {
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_PROJECT, selectedProjectId.value);
      } catch {
        /* ignore */
      }

      // Apply parent: "subtask of <id>"
      const parent = parentIssueId.value.trim();
      if (parent && created.id) {
        try {
          await addIssueLink(baseUrl, token, created.id, parent, 'subtask of');
        } catch (e) {
          console.warn('Failed to set parent link:', e);
        }
      }

      // Apply additional links: "relates to <id>" for each
      for (const linkId of linkedIssueIds.value) {
        if (!created.id) break;
        try {
          await addIssueLink(baseUrl, token, created.id, linkId, 'relates to');
        } catch (e) {
          console.warn(`Failed to add link to ${linkId}:`, e);
        }
      }

      // Render on board: transform existing draft shape if requested, otherwise create a new card.
      if (created.idReadable) {
        try {
          if (transformShapeId.value) {
            await transformShapeIntoTask(transformShapeId.value, created.idReadable);
          } else {
            await placeNewIssueOnBoard(created.idReadable);
          }
        } catch (e) {
          console.warn('Failed to render new issue on board:', e);
        }
      }

      // Persist taskQuery so that next search shows the new issue near the top? — out of scope.

      isOpen.value = false;
      return created.idReadable;
    } catch (e: any) {
      submitError.value = e?.message || 'Failed to create issue';
      return null;
    } finally {
      isSubmitting.value = false;
    }
  }

  return {
    isOpen,
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
    open,
    close,
    loadProjects,
    searchAssignees,
    searchIssuesByQuery,
    resolveUserByLogin,
    resolveIssueByKey,
    submit,
  };
}
