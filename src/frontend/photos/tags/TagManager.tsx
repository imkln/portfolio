import { useState } from 'react';
import ActionIcon from '../../shared/action-bar/ActionIcon';
import { deleteTag, type Tag } from '../tagsApi';
import TagCreator from './TagCreator';
import Dialog from '../../shared/dialog/Dialog';
import './Tags.css';
import { TagRows, tagRows } from './TagList';

export default function TagManager({ tags, onCreated, onDeleted, onClose }: {
  tags: Tag[];
  onCreated: (tag: Tag) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<Tag>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function cancelDelete() {
    setDeleting(undefined);
    setError('');
  }

  async function remove(tag: Tag) {
    setBusy(true);
    try {
      await deleteTag(tag.id);
      cancelDelete();
      onDeleted(tag.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete tag.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog className="tag-panel tag-dialog" aria-label="Tags" onDismiss={onClose}>
        <h2>Tags</h2>
        <TagRows rows={tagRows(tags)}>
          {({ tag, path }) => (
            <>
              <span>{tag.name}</span>
              <button type="button" className="tag-delete-icon" aria-label={`Delete ${path}`} title={`Delete ${path}`}
                onClick={() => setDeleting(tag)}><ActionIcon name="trash" /></button>
            </>
          )}
        </TagRows>
        <div className="tag-actions">
          <button type="button" autoFocus onClick={onClose}>Done</button>
          <button type="button" className="tag-primary" onClick={() => setCreating(true)}>New tag</button>
        </div>
      </Dialog>
      {creating && <TagCreator tags={tags} onClose={() => setCreating(false)} onCreated={(tag) => {
        setCreating(false);
        onCreated(tag);
      }} />}
      {deleting && (
        <Dialog className="tag-panel tag-dialog" aria-label={`Delete ${deleting.name}?`} busy={busy} onDismiss={cancelDelete}>
          <h2>Delete {deleting.name}?</h2>
          <fieldset disabled={busy}>
            {error ? <p role="alert">{error}</p> : <p>This removes the tag from photos that use it.</p>}
            <div className="tag-actions">
              <button type="button" autoFocus onClick={cancelDelete}>{error ? 'Done' : 'Cancel'}</button>
              {!error && <button type="button" className="tag-danger" onClick={() => void remove(deleting)}>Delete tag</button>}
            </div>
          </fieldset>
        </Dialog>
      )}
    </>
  );
}
