import { YouTrackIssue } from './types';

// YouTrack REST API response types (partial, only what we need)
interface YouTrackApiIssue {
  idReadable?: string;
  summary?: string;
  tags?: Array<{ name?: string }>;
  customFields?: Array<{
    name?: string;
    value?: { name?: string };
  }>;
  assignee?: { name?: string; login?: string } | null;
  $type?: string;
}

interface YouTrackApiResponse {
  idReadable?: string;
  summary?: string;
  tags?: Array<{ name?: string }>;
  customFields?: Array<{
    name?: string;
    value?: { name?: string };
  }>;
  assignee?: { name?: string; login?: string } | null;
}

/**
 * Normalize YouTrack API response to our YouTrackIssue DTO
 */
export function normalizeIssue(issue: YouTrackApiResponse, baseUrl: string, statusFieldName: string): YouTrackIssue {
  const idReadable = issue.idReadable || '';
  const summary = issue.summary || '';
  
  // Extract tags
  const tags = (issue.tags || []).map(tag => tag.name || '').filter(Boolean);
  
  // Extract assignee
  const assignee = issue.assignee ? (issue.assignee.name || issue.assignee.login || null) : null;
  
  // Extract state from customFields
  let stateName = '';
  if (issue.customFields) {
    const stateField = issue.customFields.find(field => field.name === statusFieldName);
    if (stateField?.value?.name) {
      stateName = stateField.value.name;
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
    url,
  };
}
