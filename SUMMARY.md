# YouTrack Plan Mindmap - Project Summary

## Overview

YouTrack Plan Mindmap is a Miro plugin that enables seamless integration between Miro boards and YouTrack issue tracking. The plugin allows users to search for YouTrack tasks, drag them onto Miro boards as mindmap nodes, and automatically sync task states, assignees, and tags between YouTrack and Miro.

## Key Features

### 1. Task Search and Discovery
- **YouTrack Query Interface**: Users can enter YouTrack search queries to find tasks
- **Virtual Scroll Task List**: Displays search results with task ID, summary, state, tags, and assignee
- **Default Search**: Automatically loads all issues sorted by update date when settings are configured
- **Real-time Search**: Instant search results with loading states and error handling

### 2. Drag and Drop Integration
- **Drag Tasks to Board**: Users can drag tasks from the plugin panel directly onto the Miro board
- **Mindmap Node Creation**: Tasks are created as Miro mindmap nodes (experimental API) with proper styling
- **Automatic Positioning**: Tasks are placed at the exact drop location on the board

### 3. Task Synchronization
- **Bidirectional Sync**: Sync tasks from YouTrack to Miro board
- **State Updates**: Automatically updates task states, colors, and content based on YouTrack data
- **Missing Task Handling**: Creates missing tasks in a "Not found" frame when they exist in YouTrack but not on the board
- **Sync Statistics**: Tracks and displays sync metrics (found issues, updated count, created count)

### 4. Visual Task Representation
- **Mindmap Nodes**: Tasks are displayed as mindmap nodes (not connected, styled as cards)
- **Color Coding**: Tasks are color-coded by state:
  - **Yellow**: Planning/Todo/Backlog states
  - **Green**: In Work/In Progress/On Desk states
  - **Purple**: Done/Resolved/Completed states
- **Tag Colors**: Tags display with their YouTrack-assigned colors
- **Localized State Names**: Uses localized state names when available from YouTrack

### 5. Task Information Display
- **Task ID**: Clickable link to YouTrack issue page
- **Summary**: Full task summary text
- **Assignee**: Displays assignee with icon (👤)
- **Tags**: Colorful tags with YouTrack colors
- **State**: Current task state (with localization support)

### 6. Settings and Configuration
- **YouTrack Instance URL**: Configure your YouTrack server URL
- **API Token**: Secure storage of YouTrack permanent token
- **Status Field Name**: Configurable field name for state tracking (default: "State")
- **Local Storage**: All settings persist in browser local storage
- **Cross-tab Sync**: Settings are synchronized across all plugin tabs

## Technical Architecture

### Frontend Stack
- **Vue 3**: Reactive UI framework with Composition API
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Miro Web SDK v2**: Integration with Miro platform

### Project Structure
```
src/
├── App.vue              # Main Vue component with tabbed UI
├── app.ts               # Vue app initialization
├── index.ts             # Miro SDK initialization (headless iframe)
├── constants.ts         # Configuration constants (colors, dimensions, etc.)
├── storage.ts           # LocalStorage persistence layer
├── youtrack/
│   ├── types.ts         # TypeScript interfaces for YouTrack data
│   ├── client.ts         # YouTrack REST API client
│   └── normalize.ts     # Data normalization from API to app format
└── miro/
    ├── taskShape.ts     # Mindmap node creation and management
    └── notFoundFrame.ts # Frame management for missing tasks
```

### Key Components

#### 1. YouTrack Integration (`src/youtrack/`)
- **REST API Client**: Handles authentication and API requests
- **Data Normalization**: Converts YouTrack API responses to app-friendly format
- **Field Requesting**: Properly requests nested fields (assignee, tags with colors, localized state names)

#### 2. Miro Board Integration (`src/miro/`)
- **Mindmap Node Creation**: Uses experimental Miro API to create mindmap nodes
- **Metadata Storage**: Stores YouTrack issue data in node metadata for tracking
- **Frame Management**: Creates and manages "Not found" frame for missing tasks

#### 3. UI Components (`src/App.vue`)
- **Three Tabs**:
  - **Tasks**: Search and drag tasks
  - **Sync**: Synchronize tasks with YouTrack
  - **Settings**: Configure YouTrack connection
- **Responsive Design**: Matches Miro design system
- **Drag and Drop**: Implements Miro's drag-and-drop API

### Data Flow

1. **Task Search Flow**:
   - User enters query → API request to YouTrack → Normalize response → Display in list → Drag to board → Create mindmap node

2. **Sync Flow**:
   - User clicks "Sync Now" → Fetch issues from YouTrack → Get all mindmap nodes from board → Match by issue URL → Update existing nodes → Create missing nodes in "Not found" frame → Update sync statistics

3. **Settings Flow**:
   - User configures YouTrack URL and token → Save to localStorage → Auto-trigger default search → Display results

## API Integration

### YouTrack REST API
- **Authentication**: Bearer token authentication
- **Search Endpoint**: `/api/issues?query=...&fields=...`
- **Requested Fields**:
  - `idReadable`: Issue ID
  - `summary`: Issue summary
  - `tags(name,color(background,foreground))`: Tags with colors
  - `customFields(name,value(name,localizedName))`: State field with localization
  - `assignee(id,login,name)`: Assignee information

### Miro Web SDK
- **Experimental API**: Uses `miro.board.experimental.createMindmapNode()` for mindmap nodes
- **Metadata API**: Stores YouTrack data in node metadata
- **Drag and Drop**: Uses `miro.board.ui.on('drop', ...)` event handler
- **Frame API**: Creates frames for organizing missing tasks

## Configuration

### Constants (`src/constants.ts`)
- Task state colors (Planning, In Work, Done)
- Fill opacity for task nodes
- Default dimensions for task shapes
- Metadata key names
- Frame titles

### Storage (`src/storage.ts`)
- Settings: YouTrack URL, token, queries, status field name
- Sync State: Last sync time, statistics

## Usage Example

1. **Initial Setup**:
   - Open plugin in Miro
   - Go to Settings tab
   - Enter YouTrack instance URL (e.g., `https://youtrack.example.com`)
   - Enter YouTrack permanent token
   - Click "Save Settings"
   - Plugin automatically loads tasks

2. **Search and Add Tasks**:
   - Go to Tasks tab
   - Enter search query (e.g., `State: In Progress`) or leave empty for all tasks
   - Click "Search"
   - Drag tasks from list onto board
   - Tasks appear as mindmap nodes

3. **Sync Tasks**:
   - Go to Sync tab
   - Enter sync query (e.g., `State: In Progress`)
   - Click "Sync Now"
   - Existing tasks are updated
   - Missing tasks are created in "Not found" frame

## Future Enhancements

- Connect mindmap nodes to create actual mindmap structure
- Support for custom field mappings
- Batch operations for multiple tasks
- Task filtering and sorting in UI
- Export/import board configurations
- Support for YouTrack projects and boards

## Development

### Prerequisites
- Node.js 14.13+
- npm or yarn
- Miro Developer account

### Setup
```bash
npm install
npm start
```

### Build
```bash
npm run build
```

### Testing
- Manual testing in Miro development environment
- Test with real YouTrack instance
- Verify drag-and-drop functionality
- Test sync operations

## Notes

- Mindmap nodes use experimental Miro API - subject to change
- Requires YouTrack instance with REST API enabled
- CORS must be configured on YouTrack instance for browser requests
- Local storage is used for persistence (not synced across devices)
