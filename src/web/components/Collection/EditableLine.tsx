import { useState } from 'react';

type Props = {
  value: string;
  placeholder: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onChange: (value: string) => void;
};

export default function EditableLine({
  value,
  placeholder,
  label,
  selected,
  onSelect,
  onChange,
}: Props) {
  const [input, setInput] = useState<string | null>(null);

  function save() {
    if (input === null) return;

    onChange(input.trim());
    setInput(null);
  }

  if (selected && input !== null) {
    return (
      <input
        aria-label={label}
        autoFocus
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

  return (
    <button
      type="button"
      className="caption-button"
      onClick={selected ? () => setInput(value) : onSelect}
    >
      {value || placeholder}
    </button>
  );
}
