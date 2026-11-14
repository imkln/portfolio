import type { MouseEvent } from 'react';

export default function dismissOnBackdrop(event: MouseEvent<HTMLDialogElement>, dismiss: () => void) {
  const dialog = event.currentTarget;
  if (event.target !== dialog || event.detail === 0) return;

  const { left, right, top, bottom } = dialog.getBoundingClientRect();
  if (event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) {
    dismiss();
  }
}
