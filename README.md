# YouTrack Plan Mindmap

A powerful Miro plugin that seamlessly integrates YouTrack issue tracking with Miro boards. Visualize your YouTrack issues as interactive cards on Miro boards, automatically sync their states, and visualize relationships between issues with intelligent connectors.

## Features

### 🔍 Task Search and Discovery
- **YouTrack Query Interface**: Search for tasks using YouTrack query syntax
- **Real-time Search**: Instant search results with loading states and error handling
- **Virtual Scroll List**: Efficiently displays large result sets
- **Default Search**: Automatically loads all issues sorted by update date when settings are configured

### 🎯 Drag and Drop Integration
- **Drag Tasks to Board**: Simply drag tasks from the plugin panel directly onto the Miro board
- **Mindmap Node Creation**: Tasks are created as styled mindmap nodes
- **Automatic Positioning**: Tasks are placed at the exact drop location on the board

### 🔄 Task Synchronization
- **Bidirectional Sync**: Sync tasks from YouTrack to Miro board with a single click
- **Smart Updates**: Automatically updates task states, colors, and content based on YouTrack data
- **Missing Task Handling**: Creates missing tasks in a "Not found" frame when they exist in YouTrack but not on the board
- **Sync Statistics**: Tracks and displays sync metrics (found issues, updated count, created count)
- **Live Refresh**: Automatically refreshes the task list when new cards are added to the board

### 🔗 Issue Links and Relationships
- **Visual Connectors**: Automatically creates visual connections between linked issues
- **Dotted Lines**: Regular links (e.g., "relates to") are shown as dotted lines
- **Solid Arrows**: Dependencies (e.g., "depends on", "blocked by") are shown as solid arrows pointing to the blocked task
- **Automatic Sync**: Connectors are automatically created, updated, and removed during sync operations
- **Smart Cleanup**: Only manages connectors between task nodes, preserving user-created connections to other items

### 📊 Visual Task Representation
- **Color-Coded States**: Tasks are automatically color-coded by state:
  - **🟡 Yellow**: Planning/Todo/Backlog states
  - **🟢 Green**: In Work/In Progress/On Desk states
  - **🟣 Purple**: Done/Resolved/Completed states
- **Tag Colors**: Tags display with their YouTrack-assigned colors
- **Localized State Names**: Uses localized state names when available from YouTrack
- **Rich Information**: Each card displays task ID, summary, assignee, state, and tags

### 🖱️ Interactive Sync Tab
- **Always Visible**: Shows all synced tasks on the board, even before running sync
- **Clickable Cards**: Click any task card to zoom to and focus on it on the board
- **Search Functionality**: Filter tasks by ID, summary, assignee, state, or tags
- **Live Updates**: Task list automatically refreshes when new cards are added

### ⚙️ Settings and Configuration
- **YouTrack Instance URL**: Configure your YouTrack server URL (stored per board in Miro)
- **API Token**: Stored in browser local storage (user-side only, not shared with board)
- **Status Field Name**: Configurable field name for state tracking (default: "State", stored per board)
- **Board Storage**: Task query, sync query, instance URL, and status field are stored in Miro board storage so they follow the board and are shared with collaborators
- **Token**: YouTrack token stays in local storage for security and persists on the user's device

## Quick Start

### Prerequisites
- Node.js 14.13+ and npm
- A Miro Developer account
- A YouTrack instance with REST API enabled
- A YouTrack permanent token

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd yotrack-plan-mindmap
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm start
   ```
   Your URL should be similar to: `http://localhost:3000`

4. **Configure in Miro**
   - Go to [Miro App Settings](https://developers.miro.com/docs/build-your-first-hello-world-app#step-3-configure-your-app-in-miro)
   - Paste your local URL under **App URL**
   - Open a board; you should see the app in the app toolbar or in the **Apps** panel

### Build for Production

```bash
npm run build
```

This generates a static output in the `dist/` directory, which you can host on any static hosting service.

## Usage

### Initial Setup

1. Open the plugin in Miro
2. Go to the **Settings** tab
3. Enter your YouTrack instance URL (e.g., `https://youtrack.example.com`)
4. Enter your YouTrack permanent token
5. Optionally configure the status field name (default: "State")
6. Click "Save Settings"
7. The plugin automatically loads tasks

### Searching and Adding Tasks

1. Go to the **Tasks** tab
2. Enter a search query (e.g., `State: In Progress`) or leave empty for all tasks
3. Click "Search"
4. Drag tasks from the list onto the board
5. Tasks appear as color-coded mindmap nodes

### Synchronizing Tasks

1. Go to the **Sync** tab
2. Enter a sync query (e.g., `State: In Progress`)
3. Click "Sync Now"
4. Existing tasks are automatically updated with latest data
5. Missing tasks are created in a "Not found" frame
6. Issue links and dependencies are automatically visualized with connectors

### Viewing Synced Tasks

1. Go to the **Sync** tab
2. All synced tasks on the board are displayed automatically
3. Use the search box to filter tasks by any field
4. Click any task card to zoom to and focus on it on the board

## Technical Details

### Tech Stack
- **Vue 3**: Reactive UI framework with Composition API
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Miro Web SDK v2**: Integration with Miro platform

### Project Structure
```
src/
├── App.vue              # Main Vue component with tabbed UI
├── app.ts               # Vue app initialization
├── index.ts             # Miro SDK initialization
├── constants.ts         # Configuration constants
├── storage.ts           # Miro board storage + localStorage (token only)
├── components/          # Vue components
│   ├── SyncTab.vue      # Sync tab with task list and search
│   ├── TasksTab.vue     # Task search and drag interface
│   ├── SettingsTab.vue  # Settings configuration
│   └── TaskItem.vue     # Task card component
├── composables/         # Vue composables
│   ├── useSync.ts       # Sync logic and connector management
│   ├── useSettings.ts   # Settings management
│   └── useDropHandler.ts # Drag and drop handling
├── youtrack/            # YouTrack integration
│   ├── types.ts         # TypeScript interfaces
│   ├── client.ts        # REST API client
│   └── normalize.ts     # Data normalization
└── miro/                # Miro board integration
    ├── taskShape.ts     # Mindmap node creation
    ├── connectors.ts    # Connector management
    └── notFoundFrame.ts # Frame management
```

### API Integration

#### YouTrack REST API
- **Authentication**: Bearer token authentication
- **Search Endpoint**: `/api/issues?query=...&fields=...`
- **Links Endpoint**: `/api/issues/{issueId}/links?fields=...`
- **Requested Fields**: idReadable, summary, tags with colors, customFields (state with localization), assignee, issue links

#### Miro Web SDK
- **Mindmap Nodes**: Uses `miro.board.experimental.createMindmapNode()` for task cards
- **Connectors**: Uses `miro.board.createConnector()` for issue relationships
- **Metadata API**: Stores YouTrack data in node/connector metadata
- **Drag and Drop**: Uses `miro.board.ui.on('drop', ...)` event handler
- **Viewport**: Uses `miro.board.viewport.zoomTo()` for navigation

## Configuration

### Constants
- Task state colors (Planning, In Work, Done)
- Fill opacity for task nodes
- Default dimensions for task shapes
- Metadata key names
- Frame titles

### Storage
- **Settings**: YouTrack URL, token, queries, status field name
- **Sync State**: Last sync time, statistics

## Examples

### Example Queries

**Find all issues in progress:**
```
State: In Progress
```

**Find issues assigned to a user:**
```
Assignee: john.doe
```

**Find issues with a specific tag:**
```
#bug
```

**Combine conditions:**
```
State: In Progress AND Assignee: john.doe
```

## Notes

- Mindmap nodes use experimental Miro API - subject to change
- Requires YouTrack instance with REST API enabled
- CORS must be configured on YouTrack instance for browser requests
- Local storage is used for persistence (not synced across devices)
- Connectors are automatically managed during sync - manual connectors between task nodes may be removed

## Development

### Folder Structure

```
.
├── src
│   ├── assets
│   │   └── style.css
│   ├── components
│   ├── composables
│   ├── miro
│   ├── youtrack
│   ├── app.ts
│   └── index.ts
├── app.html       # The app itself
└── index.html     # The app entry point
```

### Development Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Build for production
npm run build
```

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

---

Built using [`create-miro-app`](https://www.npmjs.com/package/create-miro-app) and [Vite](https://vitejs.dev/).
