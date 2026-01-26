// YouTrack issue DTO used by UI and board rendering
export interface YouTrackTag {
  name: string;
  color: string | null;
}

export interface YouTrackIssueLink {
  linkType: {
    name: string;
    sourceToTarget: string; // e.g., "depends on"
    targetToSource: string; // e.g., "is required for"
  };
  issues: Array<{
    id: string;
    idReadable: string;
    summary: string;
  }>;
  direction: 'outward' | 'inward'; // outward = this issue links to others, inward = others link to this
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
