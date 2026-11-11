import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import type { BoardItem, BoardItemChange, BoardLayout } from '../../data/Collection';
import type { Photo } from '../../data/Photo';
import useCanvasGestures from '../../hooks/useCanvasGestures';
import ActionBar from '../ActionBar/ActionBar';
import CollectionItem from '../Collection/Collection';
import PhotoPicker from '../PhotoPicker/PhotoPicker';
import './Canvas.css';

const smallScreen = '(max-width: 720px)';

function subscribeToScreen(onChange: () => void) {
  const query = window.matchMedia(smallScreen);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

type AddAction<Item> = {
  label: string;
  idPrefix: string;
} & (
  | { create: (layout: BoardLayout) => Item }
  | { choosePhoto: (layout: BoardLayout, photo: Photo) => Item }
);

type Props<Item> = {
  items: Item[];
  canEdit: boolean;
  label: string;
  editLabel: string;
  emptyMessage: string;
  photoPickerTitle: string;
  addActions: AddAction<Item>[];
  onSave: (items: Item[]) => Promise<void>;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function Canvas<Item extends BoardItem>({
  items: saved,
  canEdit,
  label,
  editLabel,
  emptyMessage,
  photoPickerTitle,
  addActions,
  onSave,
  onOpen,
}: Props<Item>) {
  const compact = useSyncExternalStore(
    subscribeToScreen,
    () => window.matchMedia(smallScreen).matches,
  );
  const [draft, setDraft] = useState<Item[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choosePhoto, setChoosePhoto] = useState<((photo: Photo) => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const board = useRef<HTMLElement>(null);
  const scrollToNew = useRef(false);
  const editing = canEdit && !compact && draft !== null;
  const items = compact
    ? [...saved].sort((a, b) => a.y - b.y)
    : editing
      ? draft
      : saved;
  const { startDrag, dragTo, stopDrag, nudge } = useCanvasGestures({
    board,
    editable: editing && !saving && !choosePhoto,
    selected: items.find((item) => item.id === selectedId),
    update,
  });

  useLayoutEffect(() => {
    if (!scrollToNew.current) return;

    scrollToNew.current = false;
    board.current?.lastElementChild?.scrollIntoView({ block: 'center' });
  }, [draft]);

  function update(id: string, change: BoardItemChange) {
    setDraft(
      (current) =>
        current?.map((item) =>
          item.id === id ? { ...item, ...change } : item,
        ) ?? null,
    );
  }

  function add(baseId: string, create: (layout: BoardLayout) => Item) {
    const frame = board.current?.getBoundingClientRect();
    if (!draft || !frame?.width) return;

    let id = baseId;
    let suffix = 2;
    while (draft.some((item) => item.id === id)) {
      id = `${baseId}-${suffix++}`;
    }

    const item = create({
      id,
      x: 0.08,
      y: draft.length ? frame.height / frame.width + 0.05 : 0,
      width: 0.38,
    });

    scrollToNew.current = true;
    setSelectedId(id);
    setDraft([...draft, item]);
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

  return (
    <main className="board-page" onKeyDown={nudge}>
      <fieldset className="board-controls" disabled={saving} aria-busy={saving}>
        {canEdit && !compact && (
          <ActionBar>
            {addActions.slice(0, editing ? addActions.length : 1).map((action) => (
              <button
                key={action.idPrefix}
                type="button"
                onClick={() => {
                  if (!editing) {
                    setDraft(saved);
                  } else if ('choosePhoto' in action) {
                    setChoosePhoto(() => (photo: Photo) =>
                      add(action.idPrefix, (layout) => action.choosePhoto(layout, photo)),
                    );
                  } else {
                    add(action.idPrefix, action.create);
                  }
                }}
              >
                {editing ? (
                  <>
                    <span aria-hidden="true">+ </span>{action.label}
                  </>
                ) : editLabel}
              </button>
            ))}
            {editing && (
              <button type="button" onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
          </ActionBar>
        )}

        {editing && saveError && (
          <p className="save-error" role="alert">
            Could not save changes.
          </p>
        )}

        <section
          ref={board}
          aria-label={label}
          className={compact ? 'collection-board compact' : 'collection-board'}
          onPointerMove={dragTo}
          onLostPointerCapture={stopDrag}
        >
          {items.length === 0 && (
            <p className="empty-board">{emptyMessage}</p>
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
              onChooseCover={() => setChoosePhoto(() => (photo: Photo) =>
                update(item.id, { coverPhotoId: photo.id, coverPhotoUrl: photo.original }),
              )}
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
      {choosePhoto && (
        <PhotoPicker
          title={photoPickerTitle}
          onClose={() => setChoosePhoto(null)}
          onChoose={choosePhoto}
        />
      )}
    </main>
  );
}
