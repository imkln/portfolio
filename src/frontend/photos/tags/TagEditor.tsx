import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Photo } from '../Photo';
import { createTag, deleteTag, editPhotoTags, type Tag } from '../tagsApi';
import ActionIcon from '../../shared/action-bar/ActionIcon';
import TagList, { type TagState } from './TagList';
import './Tags.css';

function TagDialog({ title, anchored, busy, onClose, children }: {
  title: string;
  anchored?: boolean;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} aria-label={title} className={`tag-panel tag-dialog${anchored ? ' tag-dialog-anchored' : ''}`}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}

export default function TagEditor({ mode, tags, photos, onCreated, onDeleted, onApplied, onClose }: {
  mode: 'edit' | 'manage';
  tags: Tag[];
  photos: Photo[];
  onCreated: (tag: Tag) => void;
  onDeleted: (id: string) => void;
  onApplied: () => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(false);
  const [name, setName] = useState('');
  const [parent, setParent] = useState<string>();
  const [chooseParent, setChooseParent] = useState(false);
  const parentButton = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Tag[]>([]);
  const [changes, setChanges] = useState<Record<string, TagState>>({});
  const [deleting, setDeleting] = useState<Tag>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const editing = mode === 'edit';
  const allTags = [...tags, ...drafts];

  function original(id: string): TagState {
    const count = photos.filter((photo) => photo.tagIds?.includes(id)).length;
    return count === 0 ? 'none' : count === photos.length ? 'all' : 'some';
  }

  function cycle(id: string) {
    const before = original(id);
    const current = changes[id] ?? before;
    const next = current === 'all' ? 'none' : current === 'none' && before === 'some' ? 'some' : 'all';
    setChanges((previous) => {
      const update = { ...previous };
      if (next === before) delete update[id];
      else update[id] = next;
      return update;
    });
  }

  function startCreate(value: string) {
    setName(value);
    setParent(undefined);
    setChooseParent(false);
    setError('');
    setForm(true);
  }

  function path(id?: string): string {
    const tag = allTags.find((item) => item.id === id);
    return tag ? (tag.parentId ? path(tag.parentId) + ' › ' : '') + tag.name : 'None';
  }

  async function saveTag() {
    const value = name.trim();
    if (!value || /[›>]/.test(value)) {
      setError('Enter a tag name.');
      return;
    }
    if (allTags.some((tag) => tag.parentId === parent && tag.name.toLowerCase() === value.toLowerCase())) {
      setError('A tag with that name already exists.');
      return;
    }

    if (editing) {
      const id = crypto.randomUUID();
      setDrafts([...drafts, { id, name: value, parentId: parent }]);
      setChanges({ ...changes, [id]: 'all' });
      setSearch(value);
      setForm(false);
      return;
    }

    await run(async () => {
      onCreated(await createTag(value, parent));
      setForm(false);
    });
  }

  async function apply() {
    await run(async () => {
      const resolved = new Map<string, string>();
      const add = Object.keys(changes).filter((id) => changes[id] === 'all');
      const remove = Object.keys(changes).filter((id) => changes[id] === 'none');

      async function resolve(id: string): Promise<string> {
        const saved = resolved.get(id);
        if (saved) return saved;
        const draft = drafts.find((tag) => tag.id === id);
        if (!draft) return id;

        const parentId = draft.parentId ? await resolve(draft.parentId) : undefined;
        const tag = await createTag(draft.name, parentId);
        resolved.set(id, tag.id);
        onCreated(tag);
        setDrafts((current) => current.filter((item) => item.id !== id)
          .map((item) => item.parentId === id ? { ...item, parentId: tag.id } : item));
        setChanges((current) => {
          if (!(id in current)) return current;
          const next = { ...current, [tag.id]: current[id] };
          delete next[id];
          return next;
        });
        return tag.id;
      }

      const tagIds = [];
      for (const id of add) tagIds.push(await resolve(id));
      await editPhotoTags(photos.map((photo) => photo.id), tagIds, remove);
      onApplied();
      onClose();
    });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save tags.');
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (chooseParent && form) {
      pickParent(parent);
    } else if (form) {
      setError('');
      setForm(false);
    } else if (deleting) {
      setDeleting(undefined);
      setError('');
    } else {
      onClose();
    }
  }

  function pickParent(id?: string) {
    setParent(id);
    setChooseParent(false);
    parentButton.current?.focus();
  }

  const title = form ? 'New tag' : deleting ? `Delete ${deleting.name}?` :
    editing ? `Edit tags for ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}` : 'Tags';

  return (
    <TagDialog title={title} anchored={editing && !form} busy={busy} onClose={cancel}>
      <fieldset disabled={busy}>
        {form ? (
          <form onSubmit={(event) => { event.preventDefault(); void saveTag(); }}>
            <label className="tag-field">Name<input autoFocus value={name} maxLength={90} onChange={(event) => setName(event.target.value)} /></label>
            <div className="tag-field">
              <span>Parent</span>
              <button ref={parentButton} className="tag-parent" type="button" aria-label={`Parent: ${path(parent)}`} aria-expanded={chooseParent}
                onClick={() => setChooseParent(!chooseParent)}>{path(parent)} {!chooseParent && <span aria-hidden="true">⌄</span>}</button>
            </div>
            {chooseParent && (
              <div className="tag-parent-list">
                <button type="button" onClick={() => pickParent()}>None{!parent && ' ✓'}</button>
                <TagList tags={allTags} state={(id) => id === parent ? 'all' : 'none'}
                  onSelect={pickParent} />
              </div>
            )}
            {error && <p role="alert">{error}</p>}
            <div className="tag-actions"><button type="button" onClick={() => {
              setChooseParent(false);
              setForm(false);
              setError('');
            }}>Cancel</button><button className="tag-primary">Create</button></div>
          </form>
        ) : deleting ? (
          <>
            {!error && <p>This removes the tag from photos that use it.</p>}
            {error && <p role="alert">{error}</p>}
            <div className="tag-actions"><button type="button" onClick={cancel}>Cancel</button>
              <button type="button" className="tag-danger" onClick={() => void run(async () => {
                await deleteTag(deleting.id);
                onDeleted(deleting.id);
                setDeleting(undefined);
              })}>Delete tag</button></div>
          </>
        ) : (
          <>
            {editing && <input autoFocus type="search" aria-label="Search tags" placeholder="Search tags" value={search} onChange={(event) => setSearch(event.target.value)} />}
            <TagList tags={allTags} search={search} state={(id) => changes[id] ?? original(id)}
              onSelect={cycle} action={editing ? undefined : (tag, path) => (
                <button type="button" className="tag-delete-icon" aria-label={`Delete ${path}`} title={`Delete ${path}`}
                  onClick={() => setDeleting(tag)}><ActionIcon name="trash" /></button>
              )} />
            {editing && search.trim() && !allTags.some((tag) => tag.name.toLowerCase() === search.trim().toLowerCase()) &&
              <button type="button" onClick={() => startCreate(search.trim())}>Create “{search.trim()}”</button>}
            {error && <p role="alert">{error}</p>}
            <div className="tag-actions">
              <button type="button" onClick={onClose}>{editing ? 'Cancel' : 'Done'}</button>
              {editing
                ? <button type="button" className="tag-primary" disabled={!Object.keys(changes).length} onClick={() => void apply()}>Apply changes</button>
                : <button type="button" className="tag-primary" onClick={() => startCreate('')}>New tag</button>}
            </div>
          </>
        )}
      </fieldset>
    </TagDialog>
  );
}
