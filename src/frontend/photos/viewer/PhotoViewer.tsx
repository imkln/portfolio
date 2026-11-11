import { useEffect, useRef } from 'react';
import './PhotoViewer.css';

type Props = {
  name: string;
  original: string;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
};

export default function PhotoViewer({ name, original, onClose, onNavigate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="photo-viewer"
      aria-label="Photo viewer"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

        event.preventDefault();
        onNavigate(event.key === 'ArrowLeft' ? -1 : 1);
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={() => dialog.current?.close()}
      >
        ×
      </button>
      <img src={original} alt={name} />
    </dialog>
  );
}
