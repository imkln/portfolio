import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { BoardItem, BoardItemChange } from '../collections/CollectionTypes';
import type { Transform } from './items/CanvasItem';

const nudgePixels = 8;
const minimumWidth = 0.12;

function move(collection: BoardItem, dx: number, dy: number) {
  return {
    x: Math.max(0, Math.min(1 - collection.width, collection.x + dx)),
    y: Math.max(0, collection.y + dy),
  };
}

type Drag = {
  pointerId: number;
  action: Transform;
  start: BoardItem;
  clientX: number;
  clientY: number;
  boardWidth: number;
  coverRatio: number;
};

type Options = {
  board: RefObject<HTMLElement | null>;
  editable: boolean;
  selected: BoardItem | undefined;
  update: (id: string, change: BoardItemChange) => void;
};

export default function useCanvasGestures({
  board,
  editable,
  selected,
  update,
}: Options) {
  const drag = useRef<Drag | null>(null);

  function startDrag(
    event: PointerEvent<HTMLElement>,
    action: Transform,
    collection: BoardItem,
  ) {
    const boardWidth = board.current?.getBoundingClientRect().width;
    if (!editable || event.button !== 0 || !boardWidth) return;

    const cover = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!cover?.height) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      action,
      start: collection,
      clientX: event.clientX,
      clientY: event.clientY,
      boardWidth,
      coverRatio: cover.width / cover.height,
    };
  }

  function dragTo(event: PointerEvent) {
    const gesture = drag.current;
    if (!editable || gesture?.pointerId !== event.pointerId) return;

    const { action, start, clientX, clientY, boardWidth } = gesture;
    const dx = (event.clientX - clientX) / boardWidth;
    const dy = (event.clientY - clientY) / boardWidth;

    if (action === 'move') {
      update(start.id, move(start, dx, dy));
      return;
    }

    if (start.kind === 'caption') {
      update(start.id, {
        width: Math.max(minimumWidth, Math.min(1 - start.x, start.width + dx)),
        height: Math.max(0.03, start.height + dy),
      });
      return;
    }

    const vertical = dy * gesture.coverRatio;
    const delta = Math.abs(dx) >= Math.abs(vertical) ? dx : vertical;
    const width = Math.max(
      minimumWidth,
      Math.min(1 - start.x, start.width + delta),
    );

    update(start.id, { width });
  }

  function stopDrag(event: PointerEvent) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
  }

  function nudge(event: KeyboardEvent<HTMLElement>) {
    if (
      !editable ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement
    ) return;

    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    const width = board.current?.getBoundingClientRect().width;
    if (!direction || !selected || !width) return;

    event.preventDefault();
    const [x, y] = direction;
    update(
      selected.id,
      move(selected, (x * nudgePixels) / width, (y * nudgePixels) / width),
    );
  }

  return { startDrag, dragTo, stopDrag, nudge };
}
