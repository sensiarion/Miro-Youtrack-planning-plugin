// YouTrack issue DTO used by UI and board rendering
export interface YouTrackIssue {
  idReadable: string;
  summary: string;
  tags: string[];
  assignee: string | null;
  stateName: string;
  url: string;
}
