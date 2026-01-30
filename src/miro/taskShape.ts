import {
  TASK_COLORS,
  DEFAULT_STATE_COLORS,
  TASK_FILL_OPACITY,
  METADATA_KEY,
  TASK_SHAPE_WIDTH,
  TASK_SHAPE_HEIGHT,
} from '../constants';
import { YouTrackIssue } from '../youtrack/types';

/**
 * Default color for a state name (used when no user setting exists).
 * Planning/Todo/Backlog → yellow; In work/In progress/To verify → green; Done/Resolved/Completed → purple; unknown → planning.
 */
export function getDefaultColorForState(stateName: string): string {
  const upperState = stateName.toUpperCase();
  if (upperState.includes('PLANNING') || upperState.includes('TODO') || upperState.includes('BACKLOG')) {
    return TASK_COLORS.PLANNING;
  }
  if (
    upperState.includes('IN WORK') ||
    upperState.includes('IN_PROGRESS') ||
    upperState.includes('IN PROGRESS') ||
    upperState.includes('TO VERIFY') ||
    upperState.includes('ON DESK')
  ) {
    return TASK_COLORS.IN_WORK;
  }
  if (upperState.includes('DONE') || upperState.includes('RESOLVED') || upperState.includes('COMPLETED')) {
    return TASK_COLORS.DONE;
  }
  return TASK_COLORS.PLANNING;
}

/**
 * Get color for task state. Uses user stateColors if present; else DEFAULT_STATE_COLORS by internal name; else substring-based default.
 * Tries displayKey first, then fallbackKey (internal stateName), so colors resolve whether we keyed by display or internal name.
 */
export function getTaskColor(
  displayKey: string,
  stateColors?: Record<string, string>,
  fallbackKey?: string
): string {
  if (stateColors) {
    if (displayKey && displayKey in stateColors) return stateColors[displayKey];
    if (fallbackKey && fallbackKey in stateColors) return stateColors[fallbackKey];
  }
  // Defaults: first by original (non-localized) name from constants, then substring heuristic
  const internalName = fallbackKey || displayKey || '';
  if (internalName && internalName in DEFAULT_STATE_COLORS) {
    return DEFAULT_STATE_COLORS[internalName];
  }
  return getDefaultColorForState(internalName || displayKey || '');
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
export async function createTaskShapeAt(
  issue: YouTrackIssue,
  x: number,
  y: number,
  stateColors?: Record<string, string>
): Promise<void> {
  const stateKey = issue.stateNameLocalized || issue.stateName;
  const color = getTaskColor(stateKey, stateColors, issue.stateName);
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
    tags: issue.tags.map(t => ({ name: t.name, color: t.color })),
    assignee: issue.assignee,
  });
}

/**
 * Update an existing task mindmap node with new issue data
 */
export async function updateTaskShape(
  node: any,
  issue: YouTrackIssue,
  stateColors?: Record<string, string>
): Promise<void> {
  const stateKey = issue.stateNameLocalized || issue.stateName;
  const color = getTaskColor(stateKey, stateColors, issue.stateName);
  const content = buildTaskMindmapContent(issue);
  
  // Check if node is a child of another item (part of mindmap structure)
  // If so, we should avoid sync() which can trigger parent validation errors
  const hasParent = node.parentId !== null && node.parentId !== undefined;
  
  // Update node view content and colors
  if (node.nodeView) {
    node.nodeView.content = content;
    if (node.nodeView.style) {
      node.nodeView.style.color = color; // Update node color based on task status (Yellow/Green/Purple)
    }
  }
  
  // Update linkedTo property
  node.linkedTo = issue.url;
  
  // For nodes with parent relationships, skip sync() to avoid parent validation errors
  // The content and style updates above will persist without sync()
  if (hasParent) {
    console.log('Skipping sync for node with parent to avoid parent validation error:', node.id);
    // Just update metadata without syncing
  } else {
    // For nodes without parent, safe to sync
    try {
      await node.sync();
    } catch (error: any) {
      // If sync fails due to parent/child issues, skip sync but continue
      if (error.message && (error.message.includes('child') || error.message.includes('parent') || error.message.includes('inside a parent'))) {
        console.warn('Skipping sync due to parent/child error:', node.id, error.message);
      } else {
        // Re-throw other errors
        throw error;
      }
    }
  }
  
  // Update metadata (this should work even for child nodes and doesn't require sync)
  try {
    await node.setMetadata(METADATA_KEY, {
      issueId: issue.idReadable,
      issueUrl: issue.url,
      stateName: issue.stateName,
      stateNameLocalized: issue.stateNameLocalized,
      tags: issue.tags.map(t => ({ name: t.name, color: t.color })),
      assignee: issue.assignee,
    });
  } catch (metadataError) {
    console.warn('Failed to update metadata for node:', node.id, metadataError);
    // Don't throw - metadata update failure shouldn't break sync
  }
}
