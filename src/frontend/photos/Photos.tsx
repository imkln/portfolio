import { useRef, useState } from 'react';
import ActionBar from '../shared/action-bar/ActionBar';
import ConfirmationDialog from '../shared/confirmation-dialog/ConfirmationDialog';
import PhotoGrid from './grid/PhotoGrid';
import PhotoViewer from './viewer/PhotoViewer';
import type { Photo } from './Photo';
import usePhotoLibrary from './usePhotoLibrary';
import './Photos.css';

export default function Photos() {
  const library = usePhotoLibrary();
  const { photos, loadMore, upload, uploading, uploadError, remove } = library;
  const [viewing, setViewing] = useState<{ photo: Photo } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const anchor = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
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
            disabled={uploading}
            onClick={() => input.current?.click()}
          >
            <span aria-hidden="true">+ </span>Upload photos
          </button>
        )}
        {selecting && (
          <>
            <p className="photo-selection-count" role="status">
              {selected.size} selected
            </p>
            <button
              type="button"
              disabled={deleting || selected.size === 0}
              onClick={() => confirmation.current?.showModal()}
            >
              Delete
            </button>
          </>
        )}
        <button
          key="selection-mode"
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
          {selecting ? 'Done' : 'Select'}
        </button>
      </ActionBar>

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

      <PhotoGrid
        library={library}
        selected={selecting ? selected : null}
        onActivate={(photo, shift) => {
          if (deleting) return;
          if (selecting) toggle(photo, shift);
          else setViewing({ photo });
        }}
      />

      {viewing && (
        <PhotoViewer
          name={viewing.photo.name}
          original={viewing.photo.original}
          onClose={() => setViewing(null)}
          onNavigate={(direction) => void navigatePhoto(direction)}
        />
      )}

      <ConfirmationDialog
        ref={confirmation}
        title={selected.size === 1 ? 'Delete this photo?' : `Delete ${selected.size} photos?`}
        confirmLabel="Delete"
        onConfirm={() => void deletePhotos()}
      />
    </main>
  );
}
