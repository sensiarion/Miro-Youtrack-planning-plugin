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
 * Build HTML content for task shape
 */
export function buildTaskShapeContent(issue: YouTrackIssue): string {
  const tagsText = issue.tags.length > 0 ? ` (${issue.tags.join(', ')})` : '';
  return `<p><a href="${issue.url}">${issue.idReadable}</a> ${issue.summary}${tagsText}</p>`;
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
 * Create a task shape on the board at specified coordinates
 */
export async function createTaskShapeAt(issue: YouTrackIssue, x: number, y: number): Promise<void> {
  const color = getTaskColor(issue.stateName);
  const content = buildTaskShapeContent(issue);
  
  const shape = await miro.board.createShape({
    shape: 'round_rectangle',
    content,
    x,
    y,
    width: TASK_SHAPE_WIDTH,
    height: TASK_SHAPE_HEIGHT,
    style: {
      fillColor: color,
      fillOpacity: TASK_FILL_OPACITY,
      color: '#1a1a1a',
      fontSize: 14,
      textAlign: 'left',
      textAlignVertical: 'top',
    },
  });
  
  // Mark as plugin-managed via metadata
  await shape.setMetadata(METADATA_KEY, {
    issueId: issue.idReadable,
    issueUrl: issue.url,
    stateName: issue.stateName,
  });
}

/**
 * Update an existing task shape with new issue data
 */
export async function updateTaskShape(shape: any, issue: YouTrackIssue): Promise<void> {
  const color = getTaskColor(issue.stateName);
  const content = buildTaskShapeContent(issue);
  
  shape.content = content;
  shape.style.fillColor = color;
  shape.style.fillOpacity = TASK_FILL_OPACITY;
  
  await shape.sync();
  
  // Update metadata
  await shape.setMetadata(METADATA_KEY, {
    issueId: issue.idReadable,
    issueUrl: issue.url,
    stateName: issue.stateName,
  });
}
