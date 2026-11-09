import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import type { Collection } from '../../data/Collection';
import CollectionItem from '../Collection/Collection';
import type { Transform } from '../Collection/Collection';
import './CollectionBoard.css';

const smallScreen = '(max-width: 720px)';
const nudgePixels = 8;
const minimumWidth = 0.12;

function subscribeToScreen(onChange: () => void) {
  const query = window.matchMedia(smallScreen);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function move(collection: Collection, dx: number, dy: number) {
  return {
    x: Math.max(0, Math.min(1 - collection.width, collection.x + dx)),
    y: Math.max(0, collection.y + dy),
  };
}

type Drag = {
  pointerId: number;
  action: Transform;
  start: Collection;
  clientX: number;
  clientY: number;
  boardWidth: number;
};

type Props = {
  collections: Collection[];
  canEdit: boolean;
  onSave: (collections: Collection[]) => Promise<void>;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function CollectionBoard({
  collections,
  canEdit,
  onSave,
  onOpen,
}: Props) {
  const compact = useSyncExternalStore(
    subscribeToScreen,
    () => window.matchMedia(smallScreen).matches,
  );
  const [draft, setDraft] = useState<Collection[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const board = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const scrollToNew = useRef(false);
  const editing = canEdit && !compact && draft !== null;
  const items = compact
    ? [...collections].sort((a, b) => a.y - b.y)
    : editing
      ? draft
      : collections;

  useLayoutEffect(() => {
    if (!scrollToNew.current) return;

    scrollToNew.current = false;
    board.current?.lastElementChild?.scrollIntoView({ block: 'center' });
  }, [draft]);

  function update(id: string, change: Partial<Collection>) {
    setDraft(
      (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, ...change } : item,
        ) ?? null,
    );
  }

  function add() {
    const frame = board.current?.getBoundingClientRect();
    if (!draft || !frame?.width) return;

    let id = 'untitled-collection';
    let suffix = 2;
    while (draft.some((item) => item.id === id)) {
      id = `untitled-collection-${suffix++}`;
    }

    const collection = {
      id,
      title: '',
      metadata: '',
      coverPhotoId: null,
      x: 0.08,
      y: draft.length ? frame.height / frame.width + 0.05 : 0,
      width: 0.38,
    };

    scrollToNew.current = true;
    setSelectedId(id);
    setDraft([...draft, collection]);
  }

  async function save() {
    if (!editing || saving) return;

    setSaving(true);
    setSaveError(false);
    try {
      await onSave(draft);
      setDraft(null);
      setSelectedId(null);
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  function startDrag(
    event: PointerEvent<HTMLElement>,
    action: Transform,
    collection: Collection,
  ) {
    const boardWidth = board.current?.getBoundingClientRect().width;
    if (saving || event.button !== 0 || !boardWidth) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      action,
      start: collection,
      clientX: event.clientX,
      clientY: event.clientY,
      boardWidth,
    };
  }

  function dragTo(event: PointerEvent) {
    const gesture = drag.current;
    if (!editing || saving || gesture?.pointerId !== event.pointerId) return;

    const { action, start, clientX, clientY, boardWidth } = gesture;
    const dx = (event.clientX - clientX) / boardWidth;
    const dy = (event.clientY - clientY) / boardWidth;

    if (action === 'move') {
      update(start.id, move(start, dx, dy));
      return;
    }

    const vertical = dy * 1.5;
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
    if (!editing || saving || event.target instanceof HTMLInputElement) return;

    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const direction = directions[event.key];
    const selected = items.find((item) => item.id === selectedId);
    const width = board.current?.getBoundingClientRect().width;
    if (!direction || !selected || !width) return;

    event.preventDefault();
    const [x, y] = direction;
    update(
      selected.id,
      move(selected, (x * nudgePixels) / width, (y * nudgePixels) / width),
    );
  }

  return (
    <main className="board-page" onKeyDown={nudge}>
      <fieldset className="board-controls" disabled={saving} aria-busy={saving}>
        {canEdit && !compact && (
          <div className="board-toolbar">
            <button
              type="button"
              onClick={editing ? add : () => setDraft(collections)}
            >
              {editing ? (
                <>
                  <span aria-hidden="true">+ </span>Add collection
                </>
              ) : (
                'Edit collections'
              )}
            </button>
            {editing && (
              <button type="button" onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
        )}

        {editing && saveError && (
          <p className="save-error" role="alert">
            Could not save changes.
          </p>
        )}

        <section
          ref={board}
          aria-label="Collections"
          className={compact ? 'collection-board compact' : 'collection-board'}
          onPointerMove={dragTo}
          onLostPointerCapture={stopDrag}
        >
          {items.length === 0 && (
            <p className="empty-board">No collections yet.</p>
          )}
          {items.map((item, index) => (
            <CollectionItem
              key={item.id}
              collection={item}
              rowIndex={compact ? index : undefined}
              editing={editing}
              selected={editing && item.id === selectedId}
              onOpen={onOpen}
              onSelect={() => setSelectedId(item.id)}
              onChange={(change) => update(item.id, change)}
              onDelete={() => {
                setDraft(
                  (current) =>
                    current?.filter(({ id }) => id !== item.id) ?? null,
                );
                setSelectedId(null);
              }}
              onTransform={(event, action) => startDrag(event, action, item)}
            />
          ))}
        </section>
      </fieldset>
    </main>
  );
}
