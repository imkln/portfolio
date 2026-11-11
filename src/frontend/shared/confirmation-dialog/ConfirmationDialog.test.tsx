import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import ConfirmationDialog from './ConfirmationDialog';

afterEach(cleanup);

function renderDialog() {
  const ref = createRef<HTMLDialogElement>();
  const onConfirm = vi.fn();

  render(
    <ConfirmationDialog
      ref={ref}
      title="Delete this photo?"
      confirmLabel="Delete"
      onConfirm={onConfirm}
    />,
  );

  const dialog = screen.getByRole<HTMLDialogElement>('dialog', { hidden: true });
  dialog.open = true;
  dialog.close = () => {
    dialog.open = false;
  };

  return { dialog, onConfirm };
}

it('can confirm and close the dialog', () => {
  const { dialog, onConfirm } = renderDialog();

  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

  expect(onConfirm).toHaveBeenCalledOnce();
  expect(dialog.open).toBe(false);
});

it('can cancel without confirming', () => {
  const { dialog, onConfirm } = renderDialog();

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(onConfirm).not.toHaveBeenCalled();
  expect(dialog.open).toBe(false);
});
