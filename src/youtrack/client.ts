import { YouTrackIssue, YouTrackIssueLink } from './types';
import { normalizeIssue } from './normalize';

export interface SearchIssuesParams {
  baseUrl: string;
  token: string;
  query: string;
  statusFieldName: string;
}

/** Page size used per /api/issues request when paging through results. */
const SEARCH_PAGE_SIZE = 100;
/** Hard cap to avoid runaway pagination on huge result sets. */
const SEARCH_HARD_CAP = 5000;

export interface SearchIssuesOptions {
  /** Optional callback invoked after each page; return false to stop early. */
  onPage?: (pageIssues: YouTrackIssue[], totalSoFar: number) => boolean | void;
  /** Optional AbortSignal to cancel mid-loop. */
  signal?: AbortSignal;
}

/**
 * Search YouTrack issues using REST API. Pages through results with $top/$skip until
 * the API returns a partial page, the hard cap is hit, or onPage returns false.
 */
export async function searchIssues(
  params: SearchIssuesParams,
  options: SearchIssuesOptions = {},
): Promise<YouTrackIssue[]> {
  const { baseUrl, token, query, statusFieldName } = params;
  const searchQuery = query.trim() || 'sort by: updated desc';
  const fields =
    'idReadable,summary,tags(name,color(background,foreground)),customFields(name,value(name,localizedName)),assignee(id,login,name)';
  const all: YouTrackIssue[] = [];
  let skip = 0;
  let firstPageLogged = false;

  while (all.length < SEARCH_HARD_CAP) {
    if (options.signal?.aborted) break;
    const pageUrl =
      `${trimBase(baseUrl)}/api/issues?query=${encodeURIComponent(searchQuery)}` +
      `&fields=${fields}&$top=${SEARCH_PAGE_SIZE}&$skip=${skip}`;

    let response: Response;
    try {
      response = await fetch(pageUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: options.signal,
      });
    } catch (error: any) {
      if (error?.name === 'AbortError') break;
      console.error('Failed to search YouTrack issues:', error);
      throw error;
    }

    if (!response.ok) {
      throw new Error(`YouTrack API error: ${response.status} ${response.statusText}`);
    }

    const page = await response.json();
    if (!Array.isArray(page) || page.length === 0) break;

    if (!firstPageLogged && page.length > 0) {
      const firstIssue = page[0];
      const assigneeField = firstIssue.customFields?.find((f: any) => f.name === 'Assignee');
      console.log('[client] Raw API response (first issue):', {
        idReadable: firstIssue.idReadable,
        topLevelAssignee: firstIssue.assignee,
        assigneeCustomField: assigneeField,
        allCustomFields: firstIssue.customFields?.map((f: any) => ({ name: f.name, hasValue: !!f.value })),
      });
      firstPageLogged = true;
    }

    const normalized = page.map(issue => normalizeIssue(issue, baseUrl, statusFieldName));
    all.push(...normalized);

    if (options.onPage) {
      const cont = options.onPage(normalized, all.length);
      if (cont === false) break;
    }

    if (page.length < SEARCH_PAGE_SIZE) break; // last page
    skip += SEARCH_PAGE_SIZE;
  }

  return all;
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
  const linksUrl = `${trimBase(baseUrl)}/api/issues/${issueId}/links?fields=linkType(name,localizedName,sourceToTarget,targetToSource,localizedSourceToTarget,localizedTargetToSource),issues(id,idReadable,summary)`;
  
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
          localizedName: linkType.localizedName ?? null,
          sourceToTarget: linkType.sourceToTarget || '',
          targetToSource: linkType.targetToSource || '',
          localizedSourceToTarget: linkType.localizedSourceToTarget ?? null,
          localizedTargetToSource: linkType.localizedTargetToSource ?? null,
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

export interface YouTrackProject {
  id: string;
  shortName: string;
  name: string;
}

export interface YouTrackUser {
  id: string;
  login: string;
  fullName: string;
}

function trimBase(baseUrl: string): string {
  const trimmed = (baseUrl || '').trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/** List YouTrack projects the current user can see. */
export async function listProjects(baseUrl: string, token: string): Promise<YouTrackProject[]> {
  if (!baseUrl || !token) return [];
  const url = `${trimBase(baseUrl)}/api/admin/projects?fields=id,shortName,name&$top=200`;
  try {
    const response = await fetch(url, { method: 'GET', headers: authHeaders(token) });
    if (!response.ok) {
      throw new Error(`YouTrack API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data)
      ? data.map((p: any) => ({ id: p.id, shortName: p.shortName, name: p.name }))
      : [];
  } catch (error) {
    console.error('Failed to list projects:', error);
    throw error;
  }
}

/** Search YouTrack users for assignee picker. */
export async function listUsers(
  baseUrl: string,
  token: string,
  query: string,
): Promise<YouTrackUser[]> {
  if (!baseUrl || !token) return [];
  const params = new URLSearchParams({
    fields: 'id,login,fullName',
    $top: '20',
  });
  if (query) params.set('query', query);
  const url = `${trimBase(baseUrl)}/api/users?${params.toString()}`;
  try {
    const response = await fetch(url, { method: 'GET', headers: authHeaders(token) });
    if (!response.ok) {
      throw new Error(`YouTrack API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return Array.isArray(data)
      ? data.map((u: any) => ({ id: u.id, login: u.login, fullName: u.fullName || u.login }))
      : [];
  } catch (error) {
    console.error('Failed to list users:', error);
    throw error;
  }
}

export interface CreateIssueParams {
  projectId: string;
  summary: string;
  description?: string;
  assigneeLogin?: string;
}

/** Create a YouTrack issue. Returns the new issue's idReadable. */
export async function createIssue(
  baseUrl: string,
  token: string,
  params: CreateIssueParams,
): Promise<{ id: string; idReadable: string }> {
  const url = `${trimBase(baseUrl)}/api/issues?fields=id,idReadable`;
  const body: any = {
    project: { id: params.projectId },
    summary: params.summary,
  };
  if (params.description) body.description = params.description;
  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`YouTrack create issue failed: ${response.status} ${response.statusText} ${text}`);
  }
  const data = await response.json();
  const result = { id: data.id || '', idReadable: data.idReadable || '' };

  // Set assignee via custom field if provided (YouTrack stores assignee as a custom field).
  if (params.assigneeLogin && result.id) {
    try {
      await applyCommand(baseUrl, token, result.id, `assignee ${params.assigneeLogin}`);
    } catch (e) {
      console.warn('Created issue but failed to set assignee:', e);
    }
  }
  return result;
}

/** Apply a YouTrack command to an issue (used for assignee, links, parent). */
export async function applyCommand(
  baseUrl: string,
  token: string,
  issueId: string,
  command: string,
): Promise<void> {
  const url = `${trimBase(baseUrl)}/api/commands`;
  const response = await fetch(url, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      query: command,
      issues: [{ id: issueId }],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`YouTrack command failed: ${response.status} ${response.statusText} ${text}`);
  }
}

/**
 * Add a directional link from one issue to another using a YouTrack command.
 * `linkVerb` is the human verb shown in YT, e.g. "subtask of", "depends on", "relates to".
 */
export async function addIssueLink(
  baseUrl: string,
  token: string,
  fromIssueId: string,
  toIssueIdReadable: string,
  linkVerb: string,
): Promise<void> {
  await applyCommand(baseUrl, token, fromIssueId, `${linkVerb} ${toIssueIdReadable}`);
}

/** Fetch a single issue by idReadable, normalized. Returns null on 404. */
export async function fetchIssueById(
  baseUrl: string,
  token: string,
  idReadable: string,
  statusFieldName: string,
): Promise<YouTrackIssue | null> {
  const url = `${trimBase(baseUrl)}/api/issues/${idReadable}?fields=idReadable,summary,tags(name,color(background,foreground)),customFields(name,value(name,localizedName)),assignee(id,login,name)`;
  const response = await fetch(url, { method: 'GET', headers: authHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`YouTrack API error: ${response.status} ${response.statusText}`);
  }
  const issue = await response.json();
  return normalizeIssue(issue, baseUrl, statusFieldName);
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
