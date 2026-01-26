import { YouTrackIssue } from './types';

// YouTrack REST API response types (partial, only what we need)
interface YouTrackApiIssue {
  idReadable?: string;
  summary?: string;
  tags?: Array<{ name?: string; color?: { id?: string; background?: string; foreground?: string } }>;
  customFields?: Array<{
    name?: string;
    value?: { 
      name?: string;
      localizedName?: string;
      $type?: string;
    };
  }>;
  assignee?: { name?: string; login?: string } | null;
  $type?: string;
}

interface YouTrackApiResponse {
  idReadable?: string;
  summary?: string;
  tags?: Array<{ name?: string; color?: { id?: string; background?: string; foreground?: string } }>;
  customFields?: Array<{
    name?: string;
    value?: { 
      name?: string;
      localizedName?: string;
      $type?: string;
    } | null;
  }>;
  assignee?: { name?: string; login?: string } | null;
}

/**
 * Normalize YouTrack API response to our YouTrackIssue DTO
 */
export function normalizeIssue(issue: YouTrackApiResponse, baseUrl: string, statusFieldName: string): YouTrackIssue {
  const idReadable = issue.idReadable || '';
  const summary = issue.summary || '';
  
  // Extract tags with colors
  const tags = (issue.tags || []).map(tag => {
    const name = tag.name || '';
    if (!name) return null;
    
    // Extract color - YouTrack provides background color
    // Color can be in format: { background: "#hex" } or { id: "colorId" }
    let color: string | null = null;
    if (tag.color?.background) {
      color = tag.color.background;
      // Ensure it's a valid hex color
      if (!color.startsWith('#')) {
        color = '#' + color;
      }
    } else if (tag.color?.id) {
      // Some YouTrack instances use color IDs, we'll skip those for now
      // In the future, we could map color IDs to hex values
      color = null;
    }
    
    return { name, color };
  }).filter((tag): tag is { name: string; color: string | null } => tag !== null);
  
  // Extract assignee - first try customFields["Assignee"], then fallback to top-level assignee
  let assignee: string = 'Unassigned';
  
  // Check customFields for "Assignee" field (most common case)
  if (issue.customFields) {
    const assigneeField = issue.customFields.find(field => field.name === 'Assignee');
    if (assigneeField?.value?.name) {
      const assigneeName = assigneeField.value.name.trim();
      if (assigneeName.length > 0) {
        assignee = assigneeName;
      }
    }
  }
  
  // Fallback to top-level assignee field if not found in customFields
  if (assignee === 'Unassigned' && issue.assignee) {
    const name = issue.assignee.name?.trim();
    const login = issue.assignee.login?.trim();
    if (name && name.length > 0) {
      assignee = name;
    } else if (login && login.length > 0) {
      assignee = login;
    }
  }
  
  // Extract state from customFields (with localized name if available)
  let stateName = '';
  let stateNameLocalized: string | null = null;
  if (issue.customFields) {
    const stateField = issue.customFields.find(field => field.name === statusFieldName);
    if (stateField?.value) {
      stateName = stateField.value.name || '';
      stateNameLocalized = stateField.value.localizedName || null;
    }
  }
  
  // Build issue URL
  const url = `${baseUrl.replace(/\/$/, '')}/issue/${idReadable}`;
  
  return {
    idReadable,
    summary,
    tags,
    assignee,
    stateName,
    stateNameLocalized,
    url,
  };
}
