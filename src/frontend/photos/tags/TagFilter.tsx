import { useEffect, useId, useRef, useState } from 'react';
import type { Tag } from '../tagsApi';
import TagList, { tagRows } from './TagList';
import './Tags.css';

export default function TagFilter({ tags, selected, onChange, disabled }: {
  tags: Tag[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;

    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div className="tag-filter" ref={root} onKeyDown={(event) => {
      if (event.key !== 'Escape' || !open) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
      {selected.length > 0 && <button type="button" disabled={disabled} onClick={() => {
        onChange([]);
        trigger.current?.focus();
      }}>Clear all</button>}
      <button ref={trigger} type="button" disabled={disabled} aria-label={selected.length ? `Filter by tags, ${selected.length} active` : 'Filter by tags'}
        aria-expanded={open && !disabled} aria-controls={id} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M3 4h18l-7 8v6l-4 2v-8z" strokeLinejoin="round" />
        </svg>
        {selected.length > 0 && <span aria-hidden="true">{selected.length}</span>}
      </button>
      <div id={id} className="tag-panel tag-filter-panel" hidden={!open || disabled}>
        {tags.length ? <TagList rows={tagRows(tags)} state={(tag) => selected.includes(tag) ? 'all' : 'none'}
          onSelect={(tag) => onChange(selected.includes(tag) ? selected.filter((id) => id !== tag) : [...selected, tag])} />
          : <p>No tags yet.</p>}
      </div>
    </div>
  );
}
