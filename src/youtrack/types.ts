// YouTrack issue DTO used by UI and board rendering
export interface YouTrackTag {
  name: string;
  color: string | null;
}

export interface YouTrackIssueLink {
  linkType: {
    name: string;
    localizedName?: string | null;
    sourceToTarget: string; // e.g., "depends on"
    targetToSource: string; // e.g., "is required for"
    localizedSourceToTarget?: string | null;
    localizedTargetToSource?: string | null;
  };
  issues: Array<{
    id: string;
    idReadable: string;
    summary: string;
  }>;
  /** outward = queried issue is link source; inward = queried issue is link target; both = symmetric */
  direction: 'outward' | 'inward' | 'both';
}

export interface YouTrackIssue {
  idReadable: string;
  summary: string;
  tags: YouTrackTag[];
  assignee: string; // Always a string, "Unassigned" when no assignee
  stateName: string;
  stateNameLocalized: string | null;
  url: string;
  links?: YouTrackIssueLink[]; // Links fetched separately
}
