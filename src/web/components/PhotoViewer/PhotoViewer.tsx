import { useEffect, useRef } from 'react';
import './PhotoViewer.css';

type Props = {
  name: string;
  original: string;
  onClose: () => void;
};

export default function PhotoViewer({ name, original, onClose }: Props) {
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
