// YouTrack issue DTO used by UI and board rendering
export interface YouTrackTag {
  name: string;
  color: string | null;
}

export interface YouTrackIssue {
  idReadable: string;
  summary: string;
  tags: YouTrackTag[];
  assignee: string; // Always a string, "Unassigned" when no assignee
  stateName: string;
  stateNameLocalized: string | null;
  url: string;
}
