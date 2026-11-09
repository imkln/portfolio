import { useRef, useState } from 'react';
import ActionBar from '../components/ActionBar/ActionBar';
import PhotoGrid from '../components/PhotoGrid/PhotoGrid';
import PhotoViewer from '../components/PhotoViewer/PhotoViewer';
import type { Photo } from '../data/Photo';
import usePhotoLibrary from '../hooks/usePhotoLibrary';
import './Photos.css';

export default function Photos() {
  const { photos, hasMore, nextPage, upload, uploadError, remove } =
    usePhotoLibrary();
  const [viewing, setViewing] = useState<Photo | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const modeButton = useRef<HTMLButtonElement>(null);

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

  function deletePhotos() {
    confirmation.current?.close();

    remove(selected);
    clearSelection();
    modeButton.current?.focus();
  }

  return (
    <main className="photos-page">
      <ActionBar>
        {!selecting && (
          <button type="button" onClick={() => input.current?.click()}>
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
              disabled={selected.size === 0}
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
          disabled={!selecting && photos.length === 0}
          onClick={() => {
            if (selecting) clearSelection();
            setSelecting(!selecting);
          }}
        >
          {selecting ? 'Done' : 'Select'}
        </button>
      </ActionBar>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(event) => {
          const { files } = event.currentTarget;
          if (files?.length) upload(files);
          event.currentTarget.value = '';
        }}
      />

      {uploadError && <p role="alert">Choose image files to upload.</p>}

      <PhotoGrid
        photos={photos}
        selected={selecting ? selected : null}
        onActivate={(photo, shift) =>
          selecting ? toggle(photo, shift) : setViewing(photo)
        }
      />
      {hasMore && <div ref={nextPage} className="photo-page-end" />}

      {viewing && (
        <PhotoViewer
          name={viewing.name}
          original={viewing.original}
          onClose={() => setViewing(null)}
        />
      )}

      <dialog
        ref={confirmation}
        className="photo-confirmation"
        aria-labelledby="photo-confirmation-title"
      >
        <h2 id="photo-confirmation-title">
          {selected.size === 1
            ? 'Delete this photo?'
            : `Delete ${selected.size} photos?`}
        </h2>
        <div>
          <button type="button" onClick={() => confirmation.current?.close()}>
            Cancel
          </button>
          <button type="button" onClick={deletePhotos}>
            Delete
          </button>
        </div>
      </dialog>
    </main>
  );
}
