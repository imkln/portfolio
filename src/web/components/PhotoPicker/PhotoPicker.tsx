import { useEffect, useId, useRef } from 'react';
import type { Photo } from '../../data/Photo';
import usePhotoLibrary from '../../hooks/usePhotoLibrary';
import PhotoGrid from '../PhotoGrid/PhotoGrid';
import './PhotoPicker.css';

type Props = {
  title: string;
  onChoose: (photo: Photo) => void;
  onClose: () => void;
};

export default function PhotoPicker({ title, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { photos, loading, loadError, hasMore, nextPage } = usePhotoLibrary();

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="photo-picker"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <header className="photo-picker-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </header>

      <div className="photo-picker-content">
        {loading && <p role="status">Loading photos…</p>}
        {loadError && <p role="alert">Could not load photos.</p>}
        {!loading && (!loadError || photos.length > 0) && (
          <PhotoGrid
            photos={photos}
            selected={null}
            onActivate={(photo) => {
              dialog.current?.close();
              onChoose(photo);
            }}
          />
        )}
        {hasMore && <div ref={nextPage} className="photo-picker-page-end" />}
      </div>
    </dialog>
  );
}
