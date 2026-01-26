import { YouTrackIssue, YouTrackIssueLink } from './types';
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
  // Request tag colors, localized state names, and assignee with nested fields
  // Note: assignee needs to be requested with nested properties: assignee(id,login,name)
  const searchUrl = `${baseUrl.replace(/\/$/, '')}/api/issues?query=${encodeURIComponent(searchQuery)}&fields=idReadable,summary,tags(name,color(background,foreground)),customFields(name,value(name,localizedName)),assignee(id,login,name)`;
  
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
    
    // Debug: log raw API response for first issue to check assignee structure
    if (Array.isArray(issues) && issues.length > 0) {
      const firstIssue = issues[0];
      const assigneeField = firstIssue.customFields?.find((f: any) => f.name === 'Assignee');
      console.log('[client] Raw API response (first issue):', {
        idReadable: firstIssue.idReadable,
        topLevelAssignee: firstIssue.assignee,
        assigneeCustomField: assigneeField,
        allCustomFields: firstIssue.customFields?.map((f: any) => ({ name: f.name, hasValue: !!f.value }))
      });
    }
    
    // Normalize each issue
    return (Array.isArray(issues) ? issues : []).map(issue => 
      normalizeIssue(issue, baseUrl, statusFieldName)
    );
  } catch (error) {
    console.error('Failed to search YouTrack issues:', error);
    throw error;
  }
}

export interface FetchIssueLinksParams {
  baseUrl: string;
  token: string;
  issueId: string; // idReadable like "NP-113"
}

/**
 * Fetch links for a specific YouTrack issue
 */
export async function fetchIssueLinks(params: FetchIssueLinksParams): Promise<YouTrackIssueLink[]> {
  const { baseUrl, token, issueId } = params;
  
  if (!baseUrl || !token || !issueId) {
    return [];
  }
  
  // YouTrack REST API: get links for an issue
  // Fields include linkType with direction info and related issues
  const linksUrl = `${baseUrl.replace(/\/$/, '')}/api/issues/${issueId}/links?fields=linkType(name,sourceToTarget,targetToSource),issues(id,idReadable,summary)`;
  
  try {
    const response = await fetch(linksUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      // If issue doesn't exist or has no links, return empty array
      if (response.status === 404) {
        return [];
      }
      throw new Error(`YouTrack API error: ${response.status} ${response.statusText}`);
    }
    
    const links = await response.json();
    
    if (!Array.isArray(links)) {
      return [];
    }
    
    // Normalize links - determine direction based on linkType
    return links.map((link: any) => {
      const linkType = link.linkType || {};
      const issues = link.issues || [];
      
      // Determine direction: if sourceToTarget exists, it's an outward link
      // YouTrack API returns links where this issue is the source
      return {
        linkType: {
          name: linkType.name || '',
          sourceToTarget: linkType.sourceToTarget || '',
          targetToSource: linkType.targetToSource || '',
        },
        issues: issues.map((issue: any) => ({
          id: issue.id || '',
          idReadable: issue.idReadable || '',
          summary: issue.summary || '',
        })),
        direction: 'outward' as const, // Links from API are always outward from the requested issue
      };
    });
  } catch (error) {
    console.error(`Failed to fetch links for issue ${issueId}:`, error);
    // Don't throw - return empty array so sync can continue
    return [];
  }
}

/**
 * Fetch links for multiple issues in parallel
 */
export async function fetchIssuesLinks(
  baseUrl: string,
  token: string,
  issueIds: string[]
): Promise<Map<string, YouTrackIssueLink[]>> {
  const linksMap = new Map<string, YouTrackIssueLink[]>();
  
  // Fetch links for all issues in parallel
  const linkPromises = issueIds.map(async (issueId) => {
    const links = await fetchIssueLinks({ baseUrl, token, issueId });
    return { issueId, links };
  });
  
  const results = await Promise.all(linkPromises);
  
  results.forEach(({ issueId, links }) => {
    linksMap.set(issueId, links);
  });
  
  return linksMap;
}
