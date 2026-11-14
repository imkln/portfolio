import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';

type Props = Pick<ComponentPropsWithoutRef<'dialog'>, 'aria-label' | 'aria-labelledby' | 'className' | 'children' | 'onKeyDown'> & {
  onDismiss: () => void;
  onEscape?: () => void;
  busy?: boolean;
  fullscreen?: boolean;
};

export default function Dialog({ onDismiss, onEscape = onDismiss, busy, fullscreen, ...props }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog
      {...props}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onEscape();
      }}
      onClick={(event) => {
        const element = event.currentTarget;
        if (busy || event.target !== element || event.detail === 0) return;

        const { left, right, top, bottom } = element.getBoundingClientRect();
        if (fullscreen || event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom) {
          onDismiss();
        }
      }}
    />
  );
}
