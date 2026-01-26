// Task state colors and styling constants
export const TASK_COLORS = {
  PLANNING: '#ffff00', // Yellow
  IN_WORK: '#00ff00',  // Green
  DONE: '#800080',     // Purple
} as const;

export const TASK_FILL_OPACITY = 0.7; // Default transparency

// Metadata key for identifying plugin-managed task shapes
export const METADATA_KEY = 'youtrack-task';

// Default dimensions for task shapes
export const TASK_SHAPE_WIDTH = 200;
export const TASK_SHAPE_HEIGHT = 100;

// Frame title for "Not found" items
export const NOT_FOUND_FRAME_TITLE = 'Not found';

// Storage keys
export const STORAGE_KEYS = {
  SETTINGS: 'youtrack-plan-mindmap:settings',
  SYNC_STATE: 'youtrack-plan-mindmap:sync-state',
} as const;
