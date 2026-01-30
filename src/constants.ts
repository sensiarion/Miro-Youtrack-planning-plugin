// Task state colors and styling constants
export const TASK_COLORS = {
  PLANNING: '#FFF6B6', // Yellow
  IN_WORK: '#ADF0C7',  // Green
  DONE: '#DEDAFF',     // Purple
} as const;

export const TASK_FILL_OPACITY = 0.7; // Default transparency

// Metadata key for identifying plugin-managed task shapes
export const METADATA_KEY = 'youtrack-task';

// Default dimensions for task shapes
export const TASK_SHAPE_WIDTH = 200;
export const TASK_SHAPE_HEIGHT = 100;

// Frame title for "Not found" items
export const NOT_FOUND_FRAME_TITLE = 'Not found';

// Storage: token only in localStorage (user-side); board settings in Miro board storage
export const STORAGE_KEYS = {
  TOKEN: 'youtrack-plan-mindmap:token',
} as const;

export const MIRO_BOARD_COLLECTION = 'youtrack-sync' as const;
