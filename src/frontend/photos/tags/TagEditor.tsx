import { useState } from 'react';
import type { Photo } from '../Photo';
import { editPhotoTags, type Tag } from '../tagsApi';
import TagCreator from './TagCreator';
import Dialog from '../../shared/dialog/Dialog';
import './Tags.css';
import TagList, { tagRows, type TagState } from './TagList';

export default function TagEditor({ tags, photos, onCreated, onApplied, onClose }: {
  tags: Tag[];
  photos: Photo[];
  onCreated: (tag: Tag) => void;
  onApplied: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [changes, setChanges] = useState<Record<string, TagState>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = search.trim();
  const query = name.toLowerCase();
  const rows = tagRows(tags).filter(({ path }) => path.toLowerCase().includes(query));
  const counts = new Map<string, number>();
  for (const photo of photos) {
    for (const id of photo.tagIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  function original(id: string): TagState {
    const count = counts.get(id) ?? 0;
    return count === 0 ? 'none' : count === photos.length ? 'all' : 'some';
  }

  function cycle(id: string) {
    const before = original(id);
    setChanges((previous) => {
      const current = previous[id] ?? before;
      const next = current === 'all' ? 'none' : current === 'none' && before === 'some' ? 'some' : 'all';
      const update = { ...previous };
      if (next === before) delete update[id];
      else update[id] = next;
      return update;
    });
  }

  async function apply() {
    setBusy(true);
    setError('');
    try {
      const add = Object.keys(changes).filter((id) => changes[id] === 'all');
      const remove = Object.keys(changes).filter((id) => changes[id] === 'none');
      await editPhotoTags(photos.map((photo) => photo.id), add, remove);
      onApplied();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save tags.');
    } finally {
      setBusy(false);
    }
  }

  const title = `Edit tags for ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`;
  return (
    <>
      <Dialog className="tag-panel tag-dialog tag-dialog-anchored" aria-label={title} busy={busy} onDismiss={onClose}>
        <h2>{title}</h2>
        <fieldset disabled={busy}>
          <input autoFocus type="search" aria-label="Search tags" placeholder="Search tags" value={search} onChange={(event) => setSearch(event.target.value)} />
          <TagList rows={query ? rows.map((row) => ({ ...row, depth: 0 })) : rows}
            showPaths={Boolean(query)} state={(id) => changes[id] ?? original(id)} onSelect={cycle} />
          {query && !tags.some((tag) => tag.name.toLowerCase() === query) &&
            <button type="button" onClick={() => setCreating(true)}>Create “{name}”</button>}
          {error && <p role="alert">{error}</p>}
          <div className="tag-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="button" className="tag-primary" disabled={!Object.keys(changes).length} onClick={() => void apply()}>Apply changes</button>
          </div>
        </fieldset>
      </Dialog>
      {creating && <TagCreator tags={tags} initialName={name} assigning onClose={() => setCreating(false)}
        onCreated={(tag) => {
          setCreating(false);
          setChanges((current) => ({ ...current, [tag.id]: 'all' }));
          onCreated(tag);
        }} />}
    </>
  );
}
