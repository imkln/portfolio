import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import type { Collection } from '../../data/Collection';
import ActionBar from '../ActionBar/ActionBar';
import CollectionItem from '../Collection/Collection';
import PhotoPicker from '../PhotoPicker/PhotoPicker';
import useCollectionGestures from './useCollectionGestures';
import './CollectionBoard.css';

const smallScreen = '(max-width: 720px)';

function subscribeToScreen(onChange: () => void) {
  const query = window.matchMedia(smallScreen);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

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
  const [pickerCollectionId, setPickerCollectionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const board = useRef<HTMLElement>(null);
  const scrollToNew = useRef(false);
  const editing = canEdit && !compact && draft !== null;
  const items = compact
    ? [...collections].sort((a, b) => a.y - b.y)
    : editing
      ? draft
      : collections;
  const { startDrag, dragTo, stopDrag, nudge } = useCollectionGestures({
    board,
    editable: editing && !saving && !pickerCollectionId,
    selected: items.find((item) => item.id === selectedId),
    update,
  });

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

  return (
    <main className="board-page" onKeyDown={nudge}>
      <fieldset className="board-controls" disabled={saving} aria-busy={saving}>
        {canEdit && !compact && (
          <ActionBar>
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
          </ActionBar>
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
              onChooseCover={() => setPickerCollectionId(item.id)}
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
      {pickerCollectionId && (
        <PhotoPicker
          title="Choose cover photo"
          onClose={() => setPickerCollectionId(null)}
          onChoose={(photo) =>
            update(pickerCollectionId, {
              coverPhotoId: photo.id,
              coverThumbnailUrl: photo.thumbnail,
            })
          }
        />
      )}
    </main>
  );
}
