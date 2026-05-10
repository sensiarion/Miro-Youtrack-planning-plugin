const CREATE_ISSUE_ACTION = 'youtrack-create-from-shape';

export async function init() {
  miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({ url: 'app.html' });
  });

  // Register a board context-menu / right-click action that turns the selected shape
  // into a YouTrack issue. Uses experimental.action API; if unavailable, fail silently.
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
        predicate: { type: ['shape', 'sticky_note', 'text', 'card'] },
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
      const params = new URLSearchParams();
      if (text) params.set('summary', text);
      if (item?.id) params.set('transform', item.id);
      const qs = params.toString();
      await miro.board.ui.openModal({
        url: `/create-issue.html${qs ? '?' + qs : ''}`,
        fullscreen: false,
      } as any);
    } catch (e) {
      console.error('Failed to open create modal from custom action:', e);
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
