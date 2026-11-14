import Dialog from '../../shared/dialog/Dialog';
import './PhotoViewer.css';

type Props = {
  name: string;
  original: string;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
};

export default function PhotoViewer({ name, original, onClose, onNavigate }: Props) {
  return (
    <Dialog className="photo-viewer" aria-label="Photo viewer" fullscreen onDismiss={onClose}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;

        event.preventDefault();
        onNavigate(event.key === 'ArrowLeft' ? -1 : 1);
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
      >
        ×
      </button>
      <img src={original} alt={name} />
    </Dialog>
  );
}
