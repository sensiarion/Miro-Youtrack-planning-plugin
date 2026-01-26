import { YouTrackIssue } from './types';
import { normalizeIssue } from './normalize';

export interface SearchIssuesParams {
  baseUrl: string;
  token: string;
  query: string;
  statusFieldName: string;
}

/**
 * Search YouTrack issues using REST API
 */
export async function searchIssues(params: SearchIssuesParams): Promise<YouTrackIssue[]> {
  const { baseUrl, token, query, statusFieldName } = params;
  
  if (!baseUrl || !token) {
    return [];
  }
  
  // YouTrack REST API: use query parameter for search
  // If query is empty, use default: all issues sorted by updated date desc
  const searchQuery = query.trim() || 'sort by: updated desc';
  const searchUrl = `${baseUrl.replace(/\/$/, '')}/api/issues?query=${encodeURIComponent(searchQuery)}&fields=idReadable,summary,tags(name),customFields(name,value(name)),assignee(name,login)`;
  
  try {
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`YouTrack API error: ${response.status} ${response.statusText}`);
    }
    
    const issues = await response.json();
    
    // Normalize each issue
    return (Array.isArray(issues) ? issues : []).map(issue => 
      normalizeIssue(issue, baseUrl, statusFieldName)
    );
  } catch (error) {
    console.error('Failed to search YouTrack issues:', error);
    throw error;
  }
}
