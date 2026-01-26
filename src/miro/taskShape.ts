import { TASK_COLORS, TASK_FILL_OPACITY, METADATA_KEY, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT } from '../constants';
import { YouTrackIssue } from '../youtrack/types';

/**
 * Get color for task state
 */
export function getTaskColor(stateName: string): string {
  const upperState = stateName.toUpperCase();
  if (upperState.includes('PLANNING') || upperState.includes('TODO') || upperState.includes('BACKLOG')) {
    return TASK_COLORS.PLANNING;
  }
  if (upperState.includes('IN WORK') || upperState.includes('IN_PROGRESS') || upperState.includes('ON DESK')) {
    return TASK_COLORS.IN_WORK;
  }
  if (upperState.includes('DONE') || upperState.includes('RESOLVED') || upperState.includes('COMPLETED')) {
    return TASK_COLORS.DONE;
  }
  // Default to planning color if unknown
  return TASK_COLORS.PLANNING;
}

/**
 * Build HTML content for mindmap node with clickable task ID link
 */
export function buildTaskMindmapContent(issue: YouTrackIssue): string {
  const parts: string[] = [];
  
  // Add task ID as clickable link
  parts.push(`<a href="${issue.url}" target="_blank">${issue.idReadable}</a>`);
  
  // Add summary
  parts.push(issue.summary);
  
  // Add assignee on new line (always present, shows "Unassigned" if no assignee)
  parts.push(`👤 ${issue.assignee}`);
  
  // Add tags on new line as "(<tag1>, <tag2>, ...)"
  if (issue.tags.length > 0) {
    const tagNames = issue.tags.map(t => t.name).join(', ');
    parts.push(`(${tagNames})`);
  }
  
  return parts.join('<br>');
}

/**
 * Get contrast color (black or white) for a given background color
 */
export function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * Extract issue URL from shape content (fallback detection method)
 */
export function extractIssueUrlFromShape(content: string): string | null {
  // Try to extract <a href="..."> from content
  const match = content.match(/<a\s+href=["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/**
 * Create a task mindmap node on the board at specified coordinates
 */
export async function createTaskShapeAt(issue: YouTrackIssue, x: number, y: number): Promise<void> {
  const color = getTaskColor(issue.stateName);
  const content = buildTaskMindmapContent(issue);
  
  // Create mindmap node with shape type
  // Note: Don't set isRoot when creating - Miro will determine this automatically

  const node = await miro.board.experimental.createMindmapNode({
    nodeView: {
      type: 'shape',
      shape: 'round_rectangle',
      content,
      style: {
        color: color, // Node color based on task status (Yellow/Green/Purple)
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
  
  // Mark as plugin-managed via metadata
  await node.setMetadata(METADATA_KEY, {
    issueId: issue.idReadable,
    issueUrl: issue.url,
    stateName: issue.stateName,
    stateNameLocalized: issue.stateNameLocalized,
    tags: issue.tags,
    assignee: issue.assignee,
  });
}

/**
 * Update an existing task mindmap node with new issue data
 */
export async function updateTaskShape(node: any, issue: YouTrackIssue): Promise<void> {
  const color = getTaskColor(issue.stateName);
  const content = buildTaskMindmapContent(issue);
  
  // Update node view content and colors
  node.nodeView.content = content;
  if (node.nodeView.style) {
    node.nodeView.style.color = color; // Update node color based on task status (Yellow/Green/Purple)
  }
  
  node.linkedTo = issue.url;
  
  await node.sync();
  
  // Update metadata
  await node.setMetadata(METADATA_KEY, {
    issueId: issue.idReadable,
    issueUrl: issue.url,
    stateName: issue.stateName,
    stateNameLocalized: issue.stateNameLocalized,
    tags: issue.tags,
    assignee: issue.assignee,
  });
}
