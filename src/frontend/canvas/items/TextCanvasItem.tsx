import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';

type Props = {
  value: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  editing: boolean;
  selected: boolean;
  onChange: (value: string) => void;
  onSelect: () => void;
  onMove?: (event: PointerEvent<HTMLButtonElement>) => void;
};

export default function TextCanvasItem({
  value, label, placeholder, multiline, editing, selected, onChange, onSelect, onMove,
}: Props) {
  const [input, setInput] = useState<string | null>(null);
  const press = useRef<{ x: number; y: number; dragged: boolean } | null>(null);

  function save() {
    if (input === null) return;

    onChange(input.trim());
    setInput(null);
  }

  if (editing && selected && input !== null) {
    return multiline ? (
      <textarea
        autoFocus
        aria-label={label}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={() => setInput(null)}
      />
    ) : (
      <input
        autoFocus
        aria-label={label}
        type="text"
        value={input}
        onChange={(event) => setInput(event.currentTarget.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            save();
          }
        }}
      />
    );
  }

  const content = multiline ? (
    <span className="canvas-caption-text">{value || (editing ? placeholder : '')}</span>
  ) : value || placeholder;

  if (!editing) return content;

  return (
    <button
      type="button"
      className={multiline ? 'cover-control' : 'caption-button'}
      aria-label={multiline ? 'Select Caption' : undefined}
      aria-pressed={multiline ? selected : undefined}
      onClick={(event) => {
        const dragged = event.detail > 0 && press.current?.dragged;
        press.current = null;

        if (selected && !dragged) setInput(value);
        else onSelect();
      }}
      onPointerDown={onMove && ((event) => {
        if (!selected || event.button !== 0) return;

        press.current = { x: event.clientX, y: event.clientY, dragged: false };
        onMove(event);
      })}
      onPointerMove={onMove && ((event) => {
        const start = press.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3) {
          start.dragged = true;
        }
      })}
    >
      {content}
    </button>
  );
}
