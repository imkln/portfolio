import { useRef, useState } from 'react';
import dismissOnBackdrop from '../shared/dismissOnBackdrop';
import ActionIcon from '../shared/action-bar/ActionIcon';
import ActionBar from '../shared/action-bar/ActionBar';
import PhotoGrid from './grid/PhotoGrid';
import PhotoViewer from './viewer/PhotoViewer';
import type { Photo } from './Photo';
import usePhotoLibrary from './usePhotoLibrary';
import TagFilter from './tags/TagFilter';
import TagEditor from './tags/TagEditor';
import useTags from './tags/useTags';
import './Photos.css';

export default function Photos() {
  const [filters, setFilters] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const [tagMode, setTagMode] = useState<'edit' | 'manage'>();
  const { tags, setTags, tagError } = useTags();
  const library = usePhotoLibrary(filters, revision);
  const { photos, loadMore, upload, uploading, uploadError, remove } = library;
  const [viewing, setViewing] = useState<{ photo: Photo } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const anchor = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const modeButton = useRef<HTMLButtonElement>(null);

  async function navigatePhoto(direction: -1 | 1) {
    if (!viewing) return;

    const index = photos.indexOf(viewing.photo);
    const next = photos[index + direction];
    if (next) {
      setViewing({ photo: next });
      return;
    }

    if (direction === 1) {
      const [first] = (await loadMore()) ?? [];
      if (first) {
        setViewing((current) => (current === viewing ? { photo: first } : current));
      }
    }
  }

  function toggle(photo: Photo, shift: boolean) {
    const start = photos.findIndex(({ id }) => id === anchor.current);
    const end = photos.indexOf(photo);

    if (shift && start >= 0) {
      const range = photos.slice(Math.min(start, end), Math.max(start, end) + 1);
      setSelected(
        (current) => new Set([...current, ...range.map(({ id }) => id)]),
      );
      return;
    }

    if (!selected.has(photo.id)) {
      anchor.current = photo.id;
    } else if (anchor.current === photo.id) {
      anchor.current = null;
    }

    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(photo.id)) next.add(photo.id);
      return next;
    });
  }

  function clearSelection() {
    anchor.current = null;
    setSelected(new Set());
  }

  async function deletePhotos() {
    deleteDialog.current?.close();
    setDeleting(true);
    setDeleteError(false);

    const failed = await remove(selected);
    anchor.current = null;
    setSelected(failed);
    setDeleteError(failed.size > 0);
    setDeleting(false);
    window.requestAnimationFrame(() => modeButton.current?.focus());
  }

  return (
    <main className="photos-page">
      <ActionBar>
        {!selecting && (
          <button
            type="button"
            aria-label="Upload photos" title="Upload photos" disabled={uploading}
            onClick={() => input.current?.click()}
          >
            <ActionIcon name="upload" />
          </button>
        )}
        {!selecting && !tagError && (
          <button type="button" aria-label="Tags" title="Tags" onClick={() => setTagMode('manage')}>
            <ActionIcon name="tag" />
          </button>
        )}
        {selecting && (
          <>
            <p className="photo-selection-count" role="status">
              {selected.size} selected
            </p>
            {!tagError && (
              <button type="button" aria-label="Edit tags" title="Edit tags" disabled={deleting || selected.size === 0 || selected.size > 100}
                onClick={() => setTagMode('edit')}><ActionIcon name="tag" /></button>
            )}
            <button
              aria-label="Delete" title="Delete photos"
              type="button"
              disabled={deleting || selected.size === 0}
              onClick={() => deleteDialog.current?.showModal()}
            >
              <ActionIcon name="trash" />
            </button>
          </>
        )}
        <button
          key="selection-mode"
          className={selecting ? 'photo-selection-done' : undefined}
          aria-label={selecting ? 'Done' : 'Select'}
          title={selecting ? 'Done' : 'Select'}
          aria-pressed={selecting}
          ref={modeButton}
          type="button"
          disabled={deleting || (!selecting && photos.length === 0)}
          onClick={() => {
            if (selecting) {
              clearSelection();
              setDeleteError(false);
            }
            setSelecting(!selecting);
          }}
        >
          <ActionIcon name="select" />
        </button>
      </ActionBar>

      <dialog ref={deleteDialog} className="tag-panel tag-dialog" aria-labelledby="delete-photos-title"
        onClick={(event) => dismissOnBackdrop(event, () => deleteDialog.current?.close())}>
        <h2 id="delete-photos-title">{selected.size === 1 ? 'Delete photo?' : `Delete ${selected.size} photos?`}</h2>
        <div className="tag-actions">
          <button type="button" autoFocus onClick={() => deleteDialog.current?.close()}>Cancel</button>
          <button type="button" className="tag-danger" onClick={deletePhotos}>Delete</button>
        </div>
      </dialog>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,.jpg,.jpeg"
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.currentTarget;
          if (files?.length) void upload(files);
          event.currentTarget.value = '';
        }}
      />

      {uploadError && <p role="alert">{uploadError}</p>}
      {deleteError && <p role="alert">Some photos could not be deleted.</p>}

      {tagError && <p role="alert">Could not load tags.</p>}
      {!tagError && <TagFilter tags={tags} selected={filters} disabled={selecting}
        onChange={setFilters} />}

      <PhotoGrid
        library={library}
        selected={selecting ? selected : null}
        onActivate={(photo, shift) => {
          if (deleting) return;
          if (selecting) toggle(photo, shift);
          else setViewing({ photo });
        }}
      />

      {tagMode && (
        <TagEditor mode={tagMode} tags={tags} photos={photos.filter((photo) => selected.has(photo.id))}
          onCreated={(tag) => setTags((current) => [...current, tag])}
          onDeleted={(id) => {
            setTags((current) => current.filter((tag) => tag.id !== id));
            setFilters((current) => current.includes(id) ? current.filter((tag) => tag !== id) : current);
            setRevision((current) => current + 1);
          }}
          onApplied={() => {
            clearSelection();
            setSelecting(false);
            setRevision((current) => current + 1);
          }}
          onClose={() => setTagMode(undefined)} />
      )}

      {viewing && (
        <PhotoViewer
          name={viewing.photo.name}
          original={viewing.photo.original}
          onClose={() => setViewing(null)}
          onNavigate={(direction) => void navigatePhoto(direction)}
        />
      )}
    </main>
  );
}
