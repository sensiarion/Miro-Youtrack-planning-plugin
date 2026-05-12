const CREATE_ISSUE_ACTION = 'youtrack-create-from-shape';
const PENDING_CREATE_KEY = 'youtrack-plan-mindmap:pendingCreate';

export async function init() {
  miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({ url: 'app.html' });
  });

  // Right-click action that turns the selected shape into a YouTrack issue.
  // Opens the plugin panel and signals the create view via a localStorage handoff
  // (same-origin, picked up by App.vue onMounted).
  try {
    const action = (miro.board as any).experimental?.action;
    if (action && typeof action.create === 'function') {
      await action.create({
        event: CREATE_ISSUE_ACTION,
        ui: {
          label: 'Create YouTrack issue from this',
          icon: 'plus',
          position: 'context-menu',
        },
        predicate: { type: ['shape', 'sticky_note', 'text', 'card', 'mindmap_node'] },
      });
    }
  } catch (e) {
    console.warn('Custom action registration not available; falling back to plugin-panel button only.', e);
  }

  miro.board.ui.on(`custom:${CREATE_ISSUE_ACTION}` as any, async (event: any) => {
    try {
      const items = event?.items ?? [];
      if (!items.length) return;
      const item = items[0];
      const text = extractShapeText(item);
      const payload: { description?: string; transform?: string } = {};
      if (text) payload.description = text;
      if (item?.id) payload.transform = item.id;
      try {
        localStorage.setItem(PENDING_CREATE_KEY, JSON.stringify(payload));
      } catch (storageErr) {
        console.warn('Could not store pending create payload:', storageErr);
      }
      await miro.board.ui.openPanel({ url: 'app.html' });
    } catch (e) {
      console.error('Failed to open create panel from custom action:', e);
    }
  });
}

function extractShapeText(item: any): string {
  const candidates = [item?.content, item?.title, item?.text, item?.nodeView?.content];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) {
      const plain = c
        .replace(/<br\s*\/?>(\s|&nbsp;)*/gi, ' ')
        .replace(/<\/?[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (plain) return plain;
    }
  }
  return '';
}

init();
