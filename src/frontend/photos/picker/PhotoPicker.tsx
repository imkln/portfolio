import { useEffect, useId, useRef } from 'react';
import type { Photo } from '../Photo';
import usePhotoLibrary from '../usePhotoLibrary';
import PhotoGrid from '../grid/PhotoGrid';
import './PhotoPicker.css';

type Props = {
  title: string;
  onChoose: (photo: Photo) => void;
  onClose: () => void;
};

export default function PhotoPicker({ title, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const library = usePhotoLibrary();

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
        <PhotoGrid
          library={library}
          selected={null}
          onActivate={(photo) => {
            dialog.current?.close();
            onChoose(photo);
          }}
        />
      </div>
    </dialog>
  );
}
