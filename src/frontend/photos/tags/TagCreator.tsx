import { useRef, useState } from 'react';
import { createTag, type Tag } from '../tagsApi';
import Dialog from '../../shared/dialog/Dialog';
import './Tags.css';
import TagList, { tagRows } from './TagList';

export default function TagCreator({ tags, initialName = '', assigning, onCreated, onClose }: {
  tags: Tag[];
  initialName?: string;
  assigning?: boolean;
  onCreated: (tag: Tag) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [parent, setParent] = useState<string>();
  const [chooseParent, setChooseParent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parentButton = useRef<HTMLButtonElement>(null);
  const rows = tagRows(tags);
  const path = rows.find(({ tag }) => tag.id === parent)?.path ?? 'None';

  function pickParent(id?: string) {
    setParent(id);
    setChooseParent(false);
    parentButton.current?.focus();
  }

  async function save() {
    const value = name.trim();
    if (!value || /[›>]/.test(value)) {
      setError('Enter a tag name.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      onCreated(await createTag(value, parent));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create tag.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog className="tag-panel tag-dialog" aria-label="New tag" busy={busy} onEscape={() => chooseParent ? pickParent(parent) : onClose()} onDismiss={onClose}>
      <h2>New tag</h2>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <fieldset disabled={busy}>
          <label className="tag-field">Name<input autoFocus value={name} maxLength={90} onChange={(event) => setName(event.target.value)} /></label>
          <div className="tag-field">
            <span>Parent</span>
            <button ref={parentButton} className="tag-parent" type="button" aria-label={`Parent: ${path}`} aria-expanded={chooseParent}
              onClick={() => setChooseParent(!chooseParent)}>{path} {!chooseParent && <span aria-hidden="true">⌄</span>}</button>
          </div>
          {chooseParent && (
            <div className="tag-parent-list">
              <button type="button" onClick={() => pickParent()}>None{!parent && ' ✓'}</button>
              <TagList rows={rows} state={(id) => id === parent ? 'all' : 'none'} onSelect={pickParent} />
            </div>
          )}
          {assigning && <p>The tag is saved now. Photo assignments are saved when you apply changes.</p>}
          {error && <p role="alert">{error}</p>}
          <div className="tag-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button className="tag-primary">Create</button>
          </div>
        </fieldset>
      </form>
    </Dialog>
  );
}
