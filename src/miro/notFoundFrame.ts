import { NOT_FOUND_FRAME_TITLE } from '../constants';

export const DEFAULT_FRAME_WIDTH = 1200;
export const DEFAULT_FRAME_HEIGHT = 800;
const MIN_FRAME_WIDTH = 600;
const MIN_FRAME_HEIGHT = 400;

/**
 * Get or create the "Not found" frame in the bottom-right of the current viewport
 */
export async function getOrCreateNotFoundFrame(): Promise<any> {
  // First, try to find existing frame
  const frames = await miro.board.get({ type: 'frame' });
  const existingFrame = frames.find(frame => frame.title === NOT_FOUND_FRAME_TITLE);
  
  if (existingFrame) {
    return existingFrame;
  }
  
  // Get current viewport to position frame in bottom-right
  const viewport = await miro.board.viewport.get();
  
  // Calculate bottom-right corner coordinates
  // viewport.x and viewport.y are top-left, so bottom-right is:
  const frameX = viewport.x + viewport.width - DEFAULT_FRAME_WIDTH - 50; // 50dp padding from right edge
  const frameY = viewport.y + viewport.height - DEFAULT_FRAME_HEIGHT - 50; // 50dp padding from bottom edge
  
  // Create new frame with larger default size
  const frame = await miro.board.createFrame({
    title: NOT_FOUND_FRAME_TITLE,
    x: frameX,
    y: frameY,
    width: DEFAULT_FRAME_WIDTH,
    height: DEFAULT_FRAME_HEIGHT,
    style: {
      fillColor: '#f5f5f5',
    },
  });
  
  return frame;
}

/**
 * Expand frame to accommodate more items if needed
 */
export async function expandFrameIfNeeded(frame: any, itemCount: number, itemsPerRow: number, itemWidth: number, itemHeight: number, spacing: number): Promise<void> {
  const rows = Math.ceil(itemCount / itemsPerRow);
  const requiredWidth = itemsPerRow * (itemWidth + spacing) + spacing;
  const requiredHeight = rows * (itemHeight + spacing) + spacing;
  
  const currentWidth = frame.width || MIN_FRAME_WIDTH;
  const currentHeight = frame.height || MIN_FRAME_HEIGHT;
  
  const newWidth = Math.max(currentWidth, requiredWidth, MIN_FRAME_WIDTH);
  const newHeight = Math.max(currentHeight, requiredHeight, MIN_FRAME_HEIGHT);
  
  if (newWidth > currentWidth || newHeight > currentHeight) {
    frame.width = newWidth;
    frame.height = newHeight;
    await frame.sync();
  }
}
