import { useId, type RefObject } from 'react';
import './ConfirmationDialog.css';

type Props = {
  ref: RefObject<HTMLDialogElement | null>;
  title: string;
  confirmLabel: string;
  onConfirm: () => void;
};

export default function ConfirmationDialog({ ref, title, confirmLabel, onConfirm }: Props) {
  const titleId = useId();

  return (
    <dialog
      ref={ref}
      className="confirmation-dialog"
      aria-labelledby={titleId}
    >
      <h2 id={titleId}>{title}</h2>
      <div className="confirmation-actions">
        <button type="button" onClick={() => ref.current?.close()}>
          Cancel
        </button>
        <button
          type="button"
          className="confirmation-submit"
          onClick={() => {
            ref.current?.close();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
