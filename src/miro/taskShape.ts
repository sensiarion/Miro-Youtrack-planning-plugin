import {
  TASK_COLORS,
  DEFAULT_STATE_COLORS,
  TASK_FILL_OPACITY,
  METADATA_KEY,
  STATE_COLOR_PALETTE,
} from '../constants';
import { YouTrackIssue } from '../youtrack/types';

/** Resolve task background color: user override → built-in default by internal name → first palette color. */
export function getTaskColor(
  displayKey: string,
  stateColors?: Record<string, string>,
  fallbackKey?: string,
): string {
  if (stateColors) {
    if (displayKey && displayKey in stateColors) return stateColors[displayKey];
    if (fallbackKey && fallbackKey in stateColors) return stateColors[fallbackKey];
  }
  const internalName = fallbackKey || displayKey || '';
  if (internalName && internalName in DEFAULT_STATE_COLORS) {
    return DEFAULT_STATE_COLORS[internalName];
  }
  return STATE_COLOR_PALETTE[0] ?? TASK_COLORS.PLANNING;
}

/** Build HTML content for mindmap node with clickable task ID link. */
export function buildTaskMindmapContent(issue: YouTrackIssue): string {
  const parts: string[] = [
    `<a href="${issue.url}" target="_blank">${issue.idReadable}</a>`,
    issue.summary,
    `👤 ${issue.assignee}`,
  ];
  if (issue.tags.length > 0) {
    parts.push(`(${issue.tags.map(t => t.name).join(', ')})`);
  }
  return parts.join('<br>');
}

/** Plugin-managed metadata payload stamped on every task card. */
function metadataPayload(issue: YouTrackIssue): Record<string, unknown> {
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

/** Create a task mindmap node on the board at specified coordinates. */
export async function createTaskShapeAt(
  issue: YouTrackIssue,
  x: number,
  y: number,
  stateColors?: Record<string, string>,
): Promise<void> {
  const stateKey = issue.stateNameLocalized || issue.stateName;
  const color = getTaskColor(stateKey, stateColors, issue.stateName);
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
    x,
    y,
  });

  node.linkedTo = issue.url;
  await node.sync();
  await node.setMetadata(METADATA_KEY, metadataPayload(issue) as any);
}

/** Update an existing task mindmap node with new issue data. */
export async function updateTaskShape(
  node: any,
  issue: YouTrackIssue,
  stateColors?: Record<string, string>,
): Promise<void> {
  const stateKey = issue.stateNameLocalized || issue.stateName;
  const color = getTaskColor(stateKey, stateColors, issue.stateName);
  const content = buildTaskMindmapContent(issue);

  if (node.nodeView) {
    node.nodeView.content = content;
    if (node.nodeView.style) {
      node.nodeView.style.color = color;
    }
  }
  node.linkedTo = issue.url;

  // Mindmap children with a parent throw on sync(); skip sync for them — content+style still persist.
  const hasParent = node.parentId !== null && node.parentId !== undefined;
  if (!hasParent) {
    try {
      await node.sync();
    } catch (error: any) {
      const msg = error?.message || '';
      if (!msg.includes('child') && !msg.includes('parent') && !msg.includes('inside a parent')) {
        throw error;
      }
    }
  }

  await node.setMetadata(METADATA_KEY, metadataPayload(issue) as any);
}
