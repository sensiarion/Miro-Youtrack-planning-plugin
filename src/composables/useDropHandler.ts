import { ref, onMounted, onUnmounted } from 'vue';
import { createTaskShapeAt } from '../miro/taskShape';
import { YouTrackIssue } from '../youtrack/types';

export function useDropHandler() {
  const isCreatingTask = ref(false);
  let dropHandlerRef: ((event: { x: number; y: number; target: HTMLElement }) => Promise<void>) | null = null;

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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('synced-tasks-refresh'));
      }
    } catch (error) {
      console.error('Failed to create task shape on drop:', error);
    } finally {
      // Reset flag after a short delay to prevent rapid successive drops
      setTimeout(() => {
        isCreatingTask.value = false;
      }, 500);
    }
  }

  onMounted(async () => {
    // Remove existing handler if any (to prevent duplicates)
    if (dropHandlerRef) {
      await miro.board.ui.off('drop', dropHandlerRef);
    }
    
    dropHandlerRef = handleDrop;
    await miro.board.ui.on('drop', dropHandlerRef);
  });

  onUnmounted(async () => {
    if (dropHandlerRef) {
      await miro.board.ui.off('drop', dropHandlerRef);
      dropHandlerRef = null;
    }
  });

  return {
    isCreatingTask,
  };
}
