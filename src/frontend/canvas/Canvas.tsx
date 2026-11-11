import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import type { BoardItem, BoardItemChange, BoardLayout } from '../collections/CollectionTypes';
import type { Photo } from '../photos/Photo';
import useCanvasGestures from './useCanvasGestures';
import ActionBar from '../shared/action-bar/ActionBar';
import ConfirmationDialog from '../shared/confirmation-dialog/ConfirmationDialog';
import CanvasItem from './items/CanvasItem';
import PhotoPicker from '../photos/picker/PhotoPicker';
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
  const deleteConfirmation = useRef<HTMLDialogElement>(null);
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

  function remove(id: string) {
    setDraft((current) => current?.filter((item) => item.id !== id) ?? null);
    setSelectedId(null);
  }

  function requestSave() {
    if (!editing || saving) return;

    const removesCollection = saved.some((item) =>
      item.kind === undefined && !draft.some(({ id }) => id === item.id),
    );
    if (removesCollection) {
      deleteConfirmation.current?.showModal();
    } else {
      void save();
    }
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
            {!editing && (
              <button type="button" onClick={() => setDraft(saved)}>
                {editLabel}
              </button>
            )}
            {editing && addActions.map((action, index) => (
              <button
                key={action.idPrefix}
                type="button"
                autoFocus={index === 0}
                onClick={() => {
                  if ('choosePhoto' in action) {
                    setChoosePhoto(() => (photo: Photo) =>
                      add(action.idPrefix, (layout) => action.choosePhoto(layout, photo)),
                    );
                  } else {
                    add(action.idPrefix, action.create);
                  }
                }}
              >
                <span aria-hidden="true">+ </span>{action.label}
              </button>
            ))}
            {editing && (
              <button type="button" onClick={requestSave}>
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
            <CanvasItem
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
              onDelete={() => remove(item.id)}
              onTransform={(event, action) => startDrag(event, action, item)}
            />
          ))}
        </section>
      </fieldset>
      <ConfirmationDialog
        ref={deleteConfirmation}
        title="Save changes and delete removed collections?"
        confirmLabel="Save and delete"
        onConfirm={() => void save()}
      />
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
