<script setup lang="ts">
import './assets/style.css';
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { loadSettings, saveSettings, loadSyncState, saveSyncState, type Settings, type SyncState } from './storage';
import { searchIssues } from './youtrack/client';
import { YouTrackIssue } from './youtrack/types';
import { createTaskShapeAt, updateTaskShape, extractIssueUrlFromShape, getTaskColor, buildTaskMindmapContent } from './miro/taskShape';
import { getOrCreateNotFoundFrame, expandFrameIfNeeded, DEFAULT_FRAME_WIDTH, DEFAULT_FRAME_HEIGHT } from './miro/notFoundFrame';
import { METADATA_KEY, TASK_FILL_OPACITY, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT } from './constants';
const activeTab = ref<'tasks' | 'sync' | 'settings'>('tasks');
const settings = ref<Settings>(loadSettings());
const syncState = ref<SyncState>(loadSyncState());

// Tasks tab state
const taskQuery = ref(settings.value.taskQuery);
const taskIssues = ref<YouTrackIssue[]>([]);
const isLoadingTasks = ref(false);
const taskError = ref<string | null>(null);
const isCreatingTask = ref(false); // Guard to prevent duplicate drops

// Sync tab state
const syncQuery = ref(settings.value.syncQuery);
const isSyncing = ref(false);
const syncError = ref<string | null>(null);
const syncedTasks = ref<YouTrackIssue[]>([]);

// Settings tab state
const youtrackBaseUrl = ref(settings.value.youtrackBaseUrl);
const youtrackToken = ref(settings.value.youtrackToken);
const statusFieldName = ref(settings.value.statusFieldName);

// Computed - check both refs (for real-time validation) and saved settings (for cross-tab sync)
const hasValidSettings = computed(() => {
  // Check if settings are saved and valid
  if (settings.value.youtrackBaseUrl && settings.value.youtrackToken) {
    return true;
  }
  // Also check current form values (for when user is typing but hasn't saved yet)
  return !!(youtrackBaseUrl.value && youtrackToken.value);
});

// Load tasks
async function loadTasks(queryOverride?: string) {
  if (!hasValidSettings.value) {
    taskError.value = 'Please configure YouTrack settings first';
    return;
  }

  isLoadingTasks.value = true;
  taskError.value = null;

  try {
    const queryToUse = queryOverride !== undefined ? queryOverride : taskQuery.value;
    // Use saved settings if available, otherwise use current form values
    const baseUrl = settings.value.youtrackBaseUrl || youtrackBaseUrl.value;
    const token = settings.value.youtrackToken || youtrackToken.value;
    const statusField = settings.value.statusFieldName || statusFieldName.value;
    
    const issues = await searchIssues({
      baseUrl,
      token,
      query: queryToUse,
      statusFieldName: statusField,
    });
    taskIssues.value = issues;
    
    // Debug: log issues to check assignee
    if (issues.length > 0) {
      console.log('Loaded issues:', issues.length);
      console.log('First issue:', issues[0]);
      console.log('First issue assignee:', issues[0].assignee);
    }
    
    // Save query if it was provided
    if (queryToUse) {
      saveSettings({ taskQuery: queryToUse });
      settings.value.taskQuery = queryToUse;
      taskQuery.value = queryToUse;
    }
  } catch (error: any) {
    taskError.value = error.message || 'Failed to load tasks';
    console.error('Failed to load tasks:', error);
  } finally {
    isLoadingTasks.value = false;
  }
}

// Handle drop event for drag and drop
async function handleDrop(event: { x: number; y: number; target: HTMLElement }) {
  // Prevent duplicate drops
  if (isCreatingTask.value) {
    console.log('Drop handler already processing, ignoring duplicate drop');
    return;
  }
  
  try {
    isCreatingTask.value = true;
    
    // Find the draggable element (might be the target or a parent)
    let element: HTMLElement | null = event.target as HTMLElement;
    let issueData: string | null = null;
    
    // Try to find data-issue attribute on target or parent elements
    while (element && !issueData) {
      issueData = element.getAttribute('data-issue');
      if (!issueData && element.parentElement) {
        element = element.parentElement;
      } else {
        break;
      }
    }
    
    if (!issueData) {
      console.error('No issue data found on dropped element', event.target);
      return;
    }

    const issue: YouTrackIssue = JSON.parse(issueData);
    console.log('Creating task node for issue:', issue.idReadable, 'assignee:', issue.assignee);
    await createTaskShapeAt(issue, event.x, event.y);
  } catch (error) {
    console.error('Failed to create task shape on drop:', error);
  } finally {
    // Reset flag after a short delay to prevent rapid successive drops
    setTimeout(() => {
      isCreatingTask.value = false;
    }, 500);
  }
}

// Save settings
async function saveSettingsData() {
  const newSettings: Partial<Settings> = {
    youtrackBaseUrl: youtrackBaseUrl.value,
    youtrackToken: youtrackToken.value,
    statusFieldName: statusFieldName.value,
  };
  saveSettings(newSettings);
  settings.value = { ...settings.value, ...newSettings };
  
  // Update individual refs to keep everything in sync
  // (This ensures v-model bindings and computed properties all see the same values)
  
  // If settings are now valid, trigger default search
  if (newSettings.youtrackBaseUrl && newSettings.youtrackToken) {
    // Switch to tasks tab and trigger default search
    activeTab.value = 'tasks';
    // Trigger default search with empty query (will use "sort by: updated desc")
    await loadTasks('');
  }
}

// Sync tasks
async function syncTasks() {
  if (!hasValidSettings.value || !syncQuery.value.trim()) {
    syncError.value = 'Please configure YouTrack settings and enter a sync query';
    return;
  }

  isSyncing.value = true;
  syncError.value = null;

  try {
    // Fetch issues from YouTrack
    // Use saved settings if available, otherwise use current form values
    const baseUrl = settings.value.youtrackBaseUrl || youtrackBaseUrl.value;
    const token = settings.value.youtrackToken || youtrackToken.value;
    const statusField = settings.value.statusFieldName || statusFieldName.value;
    
    const issues = await searchIssues({
      baseUrl,
      token,
      query: syncQuery.value,
      statusFieldName: statusField,
    });

    // Build map by issue URL
    const issueMap = new Map<string, YouTrackIssue>();
    issues.forEach(issue => {
      issueMap.set(issue.url, issue);
    });

    // Get all mindmap nodes and shapes on board (for backward compatibility)
    const allMindmapNodes = await miro.board.experimental.get({ type: 'mindmap_node' });
    const allShapes = await miro.board.get({ type: 'shape' });
    const allItems = [...allMindmapNodes, ...allShapes];
    
    // Identify plugin-managed task shapes and build synced tasks list
    const taskShapes: Array<{ shape: any; issueUrl: string | null; issue: YouTrackIssue | null }> = [];
    const syncedTasksList: YouTrackIssue[] = [];
    
    for (const shape of allItems) {
      let issueUrl: string | null = null;
      let issue: YouTrackIssue | null = null;
      
      // Try metadata first (primary method)
      try {
        const metadata = await shape.getMetadata(METADATA_KEY);
        if (metadata?.issueUrl) {
          issueUrl = metadata.issueUrl;
          // Try to find corresponding issue in the fetched issues
          issue = issueMap.get(issueUrl) || null;
          taskShapes.push({ shape, issueUrl, issue });
          
          // Add to synced tasks list if we have issue data
          if (issue) {
            syncedTasksList.push(issue);
          } else {
            // If issue not found in sync query results, try to extract from shape content
            const content = shape.content || '';
            const idMatch = content.match(/<a[^>]*>([^<]+)<\/a>/);
            const summaryMatch = content.match(/<\/a>\s*([^(]+)/);
            if (idMatch && summaryMatch) {
              syncedTasksList.push({
                idReadable: idMatch[1],
                summary: summaryMatch[1].trim(),
                tags: [],
                assignee: 'Unassigned',
                stateName: metadata.stateName || '',
                stateNameLocalized: null,
                url: issueUrl,
              });
            }
          }
          continue;
        }
      } catch (e) {
        // Metadata not found or error
      }
      
      // Fallback: parse from content (for shapes) or linkedTo (for mindmap nodes)
      if (shape.type === 'mindmap_node' && shape.linkedTo) {
        issueUrl = shape.linkedTo;
        issue = issueMap.get(issueUrl) || null;
        taskShapes.push({ shape, issueUrl, issue });
        
        if (issue) {
          syncedTasksList.push(issue);
        }
      } else {
        issueUrl = extractIssueUrlFromShape(shape.content || '');
        if (issueUrl) {
          issue = issueMap.get(issueUrl) || null;
          taskShapes.push({ shape, issueUrl, issue });
          
          if (issue) {
            syncedTasksList.push(issue);
          }
        }
      }
    }
    
    // Update synced tasks list
    syncedTasks.value = syncedTasksList;

    let updatedCount = 0;
    let createdCount = 0;

    // Update existing task shapes
    for (const { shape, issueUrl } of taskShapes) {
      if (!issueUrl) continue;
      
      const issue = issueMap.get(issueUrl);
      if (issue) {
        await updateTaskShape(shape, issue);
        updatedCount++;
        issueMap.delete(issueUrl); // Remove from map so we know it's on board
      }
    }

    // Create missing issues in "Not found" frame
    if (issueMap.size > 0) {
      const notFoundFrame = await getOrCreateNotFoundFrame();
      
      // Position new items in a grid inside the frame
      const itemsPerRow = 4;
      const spacing = 250;
      const padding = 100;
      const startX = padding;
      const startY = padding;
      
      // Expand frame if needed to accommodate all items
      await expandFrameIfNeeded(notFoundFrame, issueMap.size, itemsPerRow, TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT, spacing);
      
      // Refresh frame to get updated dimensions
      await notFoundFrame.sync();
      
      // Get current frame dimensions after potential expansion
      const frameWidth = notFoundFrame.width || DEFAULT_FRAME_WIDTH;
      const frameHeight = notFoundFrame.height || DEFAULT_FRAME_HEIGHT;
      
      let index = 0;
      for (const issue of issueMap.values()) {
        const row = Math.floor(index / itemsPerRow);
        const col = index % itemsPerRow;
        const relX = startX + col * spacing;
        const relY = startY + row * spacing;
        
        // Calculate absolute position relative to board center
        // Frame center is at (notFoundFrame.x, notFoundFrame.y)
        // Frame top-left corner is at (notFoundFrame.x - width/2, notFoundFrame.y - height/2)
        // Item position relative to frame top-left is (relX, relY)
        // So absolute position is: top-left + relative position
        const shapeX = notFoundFrame.x - (frameWidth / 2) + relX;
        const shapeY = notFoundFrame.y - (frameHeight / 2) + relY;
        
        // Create mindmap node at calculated position
        const color = getTaskColor(issue.stateName);
        const content = buildTaskMindmapContent(issue);
        
        // Ensure node is within frame bounds before creating
        // Frame bounds: from (notFoundFrame.x - frameWidth/2, notFoundFrame.y - frameHeight/2)
        // to (notFoundFrame.x + frameWidth/2, notFoundFrame.y + frameHeight/2)
        const frameLeft = notFoundFrame.x - frameWidth / 2;
        const frameTop = notFoundFrame.y - frameHeight / 2;
        const frameRight = notFoundFrame.x + frameWidth / 2;
        const frameBottom = notFoundFrame.y + frameHeight / 2;
        
        // Ensure shape center is within frame bounds (with some margin for shape size)
        const shapeMargin = Math.max(TASK_SHAPE_WIDTH, TASK_SHAPE_HEIGHT) / 2;
        const clampedX = Math.max(frameLeft + shapeMargin, Math.min(frameRight - shapeMargin, shapeX));
        const clampedY = Math.max(frameTop + shapeMargin, Math.min(frameBottom - shapeMargin, shapeY));
        
        // Create mindmap node
        // Note: Don't set isRoot when creating - Miro will determine this automatically
        // Note: fillColor cannot be set during creation, must be set after
        const node = await miro.board.experimental.createMindmapNode({
          nodeView: {
            type: 'shape',
            shape: 'round_rectangle',
            content,
            style: {
              color: '#1a1a1a',
              fillOpacity: TASK_FILL_OPACITY,
              fontSize: 14,
              borderStyle: 'normal',
            },
          },
          x: clampedX,
          y: clampedY,
        });
        
        node.linkedTo = issue.url;
        
        // Set fillColor after creation (cannot be set during creation)
        if (node.nodeView && node.nodeView.style) {
          node.nodeView.style.fillColor = color;
        }
        
        await node.sync();
        
        await node.setMetadata(METADATA_KEY, {
          issueId: issue.idReadable,
          issueUrl: issue.url,
          stateName: issue.stateName,
          stateNameLocalized: issue.stateNameLocalized,
          tags: issue.tags,
          assignee: issue.assignee,
        });
        
        // Note: Mindmap nodes cannot be added to frames
        // They will be positioned on the board but not inside the frame
        
        createdCount++;
        index++;
      }
    }

    // Save sync state
    const newSyncState: SyncState = {
      lastSyncAt: new Date().toISOString(),
      foundIssueCount: issues.length,
      updatedOnBoardCount: updatedCount,
      createdInNotFoundCount: createdCount,
    };
    saveSyncState(newSyncState);
    syncState.value = newSyncState;

    // Save sync query
    saveSettings({ syncQuery: syncQuery.value });
    settings.value.syncQuery = syncQuery.value;

    alert(`Sync completed! Found ${issues.length} issues, updated ${updatedCount}, created ${createdCount} new items.`);
  } catch (error: any) {
    syncError.value = error.message || 'Failed to sync tasks';
    console.error('Failed to sync tasks:', error);
  } finally {
    isSyncing.value = false;
  }
}

/**
 * Get contrast color (black or white) for a given background color
 */
function getContrastColor(hexColor: string): string {
  // Remove # if present
  const hex = hexColor.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  // Return black for light colors, white for dark colors
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

// Store drop handler reference to allow cleanup
let dropHandlerRef: ((event: { x: number; y: number; target: HTMLElement }) => Promise<void>) | null = null;

// Initialize drop handler and auto-load if settings are configured
onMounted(async () => {
  // Remove existing handler if any (to prevent duplicates)
  if (dropHandlerRef) {
    await miro.board.ui.off('drop', dropHandlerRef);
  }
  
  dropHandlerRef = handleDrop;
  await miro.board.ui.on('drop', dropHandlerRef);
  
  // If settings are already configured, trigger default search
  if (hasValidSettings.value) {
    await loadTasks('');
  }
});

// Cleanup drop handler on unmount
onUnmounted(async () => {
  if (dropHandlerRef) {
    await miro.board.ui.off('drop', dropHandlerRef);
    dropHandlerRef = null;
  }
});
</script>

<template>
  <div id="root">
    <div class="app-container">
      <!-- Tabs -->
      <div class="tabs">
        <button 
          :class="['tab', { active: activeTab === 'tasks' }]"
          @click="activeTab = 'tasks'"
        >
          Tasks
        </button>
        <button 
          :class="['tab', { active: activeTab === 'sync' }]"
          @click="activeTab = 'sync'"
        >
          Sync
        </button>
        <button 
          :class="['tab', { active: activeTab === 'settings' }]"
          @click="activeTab = 'settings'"
        >
          Settings
        </button>
      </div>

      <!-- Tasks Tab -->
      <div v-if="activeTab === 'tasks'" class="tab-content">
        <h2>Search YouTrack Tasks</h2>
        <div class="form-group">
          <label for="task-query">Search Query:</label>
          <input 
            id="task-query"
            v-model="taskQuery"
            type="text"
            placeholder="Leave empty for all issues (sorted by update date)"
            class="input"
            @keyup.enter="loadTasks"
          />
          <button 
            class="button button-primary"
            :disabled="isLoadingTasks || !hasValidSettings"
            @click="loadTasks()"
          >
            <span v-if="isLoadingTasks">Loading...</span>
            <span v-else>Search</span>
          </button>
        </div>

        <div v-if="taskError" class="error">{{ taskError }}</div>
        <div v-if="!hasValidSettings" class="warning">
          Please configure YouTrack settings in the Settings tab first.
        </div>

        <div v-if="taskIssues.length > 0" class="task-list">
          <div 
            v-for="issue in taskIssues"
            :key="issue.idReadable"
            class="task-item miro-draggable mindmap-card"
            :data-issue="JSON.stringify(issue)"
          >
            <div class="task-header">
              <div class="task-id">{{ issue.idReadable }}</div>
              <a 
                :href="issue.url" 
                target="_blank" 
                class="task-link-icon"
                title="Open in YouTrack"
                @click.stop
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3.33333V8M12 8L9.33333 5.33333M12 8L9.33333 10.6667M8 12.6667H3.33333C2.59695 12.6667 2 12.0697 2 11.3333V4.66667C2 3.93029 2.59695 3.33333 3.33333 3.33333H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </a>
            </div>
            <div class="task-summary">{{ issue.summary }}</div>
            <div class="task-meta">
              <span v-if="issue.stateNameLocalized || issue.stateName" class="task-state">
                {{ issue.stateNameLocalized || issue.stateName }}
              </span>
              <span class="task-assignee" :class="{ 'task-assignee-unassigned': issue.assignee === 'Unassigned' }">
                👤 {{ issue.assignee }}
              </span>
            </div>
            <div v-if="issue.tags.length > 0" class="task-tags-container">
              <span 
                v-for="tag in issue.tags" 
                :key="tag.name"
                class="task-tag"
                :style="tag.color ? { backgroundColor: tag.color, color: getContrastColor(tag.color) } : {}"
              >
                {{ tag.name }}
              </span>
            </div>
          </div>
        </div>
        <div v-else-if="!isLoadingTasks && !taskError && hasValidSettings" class="empty-state">
          Enter a search query (or leave empty for all issues) and click "Search" to find tasks. Drag tasks onto the board to create task cards.
        </div>
      </div>

      <!-- Sync Tab -->
      <div v-if="activeTab === 'sync'" class="tab-content">
        <h2>Sync Tasks</h2>
        <div class="form-group">
          <label for="sync-query">Sync Query:</label>
          <input 
            id="sync-query"
            v-model="syncQuery"
            type="text"
            placeholder="e.g., State: In Progress"
            class="input"
          />
          <button 
            class="button button-primary"
            :disabled="isSyncing || !hasValidSettings"
            @click="syncTasks"
          >
            <span v-if="isSyncing">Syncing...</span>
            <span v-else>Sync Now</span>
          </button>
        </div>

        <div v-if="syncError" class="error">{{ syncError }}</div>
        <div v-if="!hasValidSettings" class="warning">
          Please configure YouTrack settings in the Settings tab first.
        </div>

        <div class="sync-info">
          <div class="info-item">
            <strong>Last Sync:</strong>
            <span>{{ syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString() : 'Never' }}</span>
          </div>
          <div class="info-item">
            <strong>Found Issues:</strong>
            <span>{{ syncState.foundIssueCount }}</span>
          </div>
          <div class="info-item">
            <strong>Updated on Board:</strong>
            <span>{{ syncState.updatedOnBoardCount }}</span>
          </div>
          <div class="info-item">
            <strong>Created in "Not found":</strong>
            <span>{{ syncState.createdInNotFoundCount }}</span>
          </div>
        </div>

        <div v-if="syncedTasks.length > 0" class="synced-tasks-section">
          <h3>Synced Tasks on Board ({{ syncedTasks.length }})</h3>
          <div class="task-list">
            <div 
              v-for="issue in syncedTasks"
              :key="issue.idReadable"
              class="task-item"
            >
            <div class="task-header">
              <div class="task-id">{{ issue.idReadable }}</div>
              <a 
                :href="issue.url" 
                target="_blank" 
                class="task-link-icon"
                title="Open in YouTrack"
                @click.stop
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 3.33333V8M12 8L9.33333 5.33333M12 8L9.33333 10.6667M8 12.6667H3.33333C2.59695 12.6667 2 12.0697 2 11.3333V4.66667C2 3.93029 2.59695 3.33333 3.33333 3.33333H8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </a>
            </div>
            <div class="task-summary">{{ issue.summary }}</div>
            <div class="task-meta">
              <span v-if="issue.stateNameLocalized || issue.stateName" class="task-state">
                {{ issue.stateNameLocalized || issue.stateName }}
              </span>
              <span class="task-assignee" :class="{ 'task-assignee-unassigned': issue.assignee === 'Unassigned' }">
                👤 {{ issue.assignee }}
              </span>
            </div>
            <div v-if="issue.tags.length > 0" class="task-tags-container">
              <span 
                v-for="tag in issue.tags" 
                :key="tag.name"
                class="task-tag"
                :style="tag.color ? { backgroundColor: tag.color, color: getContrastColor(tag.color) } : {}"
              >
                {{ tag.name }}
              </span>
            </div>
            </div>
          </div>
        </div>
        <div v-else-if="!isSyncing && hasValidSettings" class="empty-state">
          No synced tasks found on board. Run a sync to see tasks here.
        </div>
      </div>

      <!-- Settings Tab -->
      <div v-if="activeTab === 'settings'" class="tab-content">
        <h2>Settings</h2>
        <div class="form-group">
          <label for="youtrack-url">YouTrack Instance URL:</label>
          <input 
            id="youtrack-url"
            v-model="youtrackBaseUrl"
            type="text"
            placeholder="https://youtrack.example.com"
            class="input"
          />
        </div>
        <div class="form-group">
          <label for="youtrack-token">YouTrack API Token:</label>
          <input 
            id="youtrack-token"
            v-model="youtrackToken"
            type="password"
            placeholder="Your permanent token"
            class="input"
          />
        </div>
        <div class="form-group">
          <label for="status-field">Status Field Name:</label>
          <input 
            id="status-field"
            v-model="statusFieldName"
            type="text"
            placeholder="State"
            class="input"
          />
          <small>Default: "State" - change if your YouTrack uses a different field name</small>
        </div>
        <button 
          class="button button-primary"
          @click="saveSettingsData"
        >
          Save Settings
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--gray-200, #e5e7eb);
  background: var(--gray-50, #f9fafb);
  flex-shrink: 0;
}

.tab {
  flex: 1;
  padding: 12px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--gray-600, #4b5563);
  transition: all 0.2s;
  white-space: nowrap;
}

.tab:hover {
  background: var(--gray-100, #f3f4f6);
  color: var(--gray-900, #111827);
}

.tab.active {
  color: var(--blue-600, #2563eb);
  border-bottom-color: var(--blue-600, #2563eb);
  font-weight: 600;
  background: #ffffff;
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  min-height: 0;
  -webkit-overflow-scrolling: touch;
}

/* Ensure proper scrolling on mobile */
@media (max-width: 768px) {
  .tab-content {
    padding: 12px;
  }
  
  .tabs {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  
  .tab {
    min-width: 80px;
  }
}

h2 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 18px;
  font-weight: 600;
  color: var(--gray-900, #111827);
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  font-size: 14px;
  color: var(--gray-700, #374151);
}

.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--gray-300, #d1d5db);
  border-radius: 6px;
  font-size: 14px;
  margin-bottom: 8px;
  background: #ffffff;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input:focus {
  outline: none;
  border-color: var(--blue-500, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

small {
  display: block;
  color: var(--gray-500, #6b7280);
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.4;
}

.button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.button-primary {
  background: var(--blue-600, #2563eb);
  color: white;
}

.button-primary:hover:not(:disabled) {
  background: var(--blue-700, #1d4ed8);
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.button-primary:disabled {
  background: var(--gray-300, #d1d5db);
  color: var(--gray-500, #6b7280);
  cursor: not-allowed;
}

.error {
  padding: 12px;
  background: var(--red-50, #fef2f2);
  color: var(--red-700, #b91c1c);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  border: 1px solid var(--red-200, #fecaca);
}

.warning {
  padding: 12px;
  background: var(--yellow-50, #fffbeb);
  color: var(--yellow-800, #92400e);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 14px;
  border: 1px solid var(--yellow-200, #fde68a);
}

.task-list {
  margin-top: 16px;
}

.task-item {
  padding: 16px;
  border: 2px solid var(--gray-200, #e5e7eb);
  border-radius: 12px;
  margin-bottom: 12px;
  cursor: grab;
  background: white;
  transition: all 0.2s;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.mindmap-card {
  border-radius: 16px;
  border-width: 2px;
  position: relative;
}

.task-item:hover {
  border-color: var(--blue-400, #60a5fa);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
}

.task-item:active {
  cursor: grabbing;
  transform: translateY(0);
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.task-id {
  font-weight: 700;
  color: var(--blue-600, #2563eb);
  font-size: 15px;
  letter-spacing: -0.02em;
}

.task-link-icon {
  color: var(--gray-500, #6b7280);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  transition: all 0.2s;
  flex-shrink: 0;
}

.task-link-icon:hover {
  color: var(--blue-600, #2563eb);
  background: var(--blue-50, #eff6ff);
}

.task-summary {
  margin-bottom: 10px;
  color: var(--gray-900, #111827);
  font-size: 14px;
  line-height: 1.5;
  font-weight: 500;
}

.task-meta {
  display: flex;
  gap: 6px;
  font-size: 12px;
  color: var(--gray-600, #4b5563);
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.task-state {
  padding: 4px 10px;
  background: var(--gray-100, #f3f4f6);
  border-radius: 6px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.task-assignee {
  padding: 4px 10px;
  background: var(--blue-50, #eff6ff);
  border-radius: 6px;
  color: var(--blue-700, #1d4ed8);
  font-weight: 500;
  font-size: 11px;
  display: inline-block;
}

.task-assignee-unassigned {
  background: var(--gray-100, #f3f4f6);
  color: var(--gray-500, #6b7280);
  font-style: italic;
}

.task-tags-container {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.task-tag {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  background-color: var(--gray-100, #f3f4f6);
  color: var(--gray-700, #374151);
  display: inline-block;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  color: var(--gray-500, #6b7280);
  font-size: 14px;
  line-height: 1.5;
}

.sync-info {
  margin-top: 16px;
  padding: 16px;
  background: var(--gray-50, #f9fafb);
  border-radius: 6px;
  border: 1px solid var(--gray-200, #e5e7eb);
}

.info-item {
  margin-bottom: 12px;
  font-size: 14px;
  display: flex;
  align-items: baseline;
}

.info-item:last-child {
  margin-bottom: 0;
}

.info-item strong {
  display: inline-block;
  min-width: 150px;
  color: var(--gray-700, #374151);
  margin-right: 8px;
}

.info-item span {
  color: var(--gray-900, #111827);
  font-weight: 500;
}

.synced-tasks-section {
  margin-top: 24px;
}

.synced-tasks-section h3 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--gray-900, #111827);
}
</style>
