import { useState } from 'react';
import type { Tag } from '../tagsApi';

export type TagState = 'all' | 'some' | 'none';

export default function TagList({ tags, state, onSelect, search = '', selectedParent }: {
  tags: Tag[];
  state: (id: string) => TagState;
  onSelect: (id: string) => void;
  search?: string;
  selectedParent?: string;
}) {
  const [expanded, setExpanded] = useState(() => {
    const parents = new Set<string>();
    for (let id = selectedParent; id;) {
      const parent = tags.find((tag) => tag.id === id)?.parentId;
      if (!parent) break;
      parents.add(parent);
      id = parent;
    }
    return parents;
  });
  const ordered = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  const paths = new Map<string, string>();
  const rows: { tag: Tag; depth: number }[] = [];

  function addRows(parent?: string, depth = 0, path = '', visible = true) {
    for (const tag of ordered.filter((item) => item.parentId === parent)) {
      const name = path ? path + ' › ' + tag.name : tag.name;
      paths.set(tag.id, name);
      if (visible) rows.push({ tag, depth });
      addRows(tag.id, depth + 1, name, visible && expanded.has(tag.id));
    }
  }

  addRows();
  const query = search.trim().toLowerCase();
  const shown = query
    ? ordered.filter((tag) => paths.get(tag.id)?.toLowerCase().includes(query)).map((tag) => ({ tag, depth: 0 }))
    : rows;

  return (
    <div className="tag-list">
      {shown.map(({ tag, depth }) => {
        const value = state(tag.id);
        const open = expanded.has(tag.id);

        return (
          <div className="tag-row" key={tag.id} style={{ paddingInlineStart: Math.min(depth, 8) * 12 }}>
            <button type="button" aria-label={paths.get(tag.id)} aria-pressed={value === 'some' ? 'mixed' : value === 'all'} onClick={() => onSelect(tag.id)}>
              {query ? paths.get(tag.id) : tag.name}
              {value !== 'none' && <span className="tag-mark" aria-hidden="true">{value === 'all' ? '✓' : '−'}</span>}
            </button>
            {!query && tags.some((item) => item.parentId === tag.id) && (
              <button type="button" className="tag-expand" aria-expanded={open}
                aria-label={`${open ? 'Hide' : 'Show'} subtags of ${paths.get(tag.id)}`}
                onClick={() => setExpanded((current) => {
                  const next = new Set(current);
                  if (!next.delete(tag.id)) next.add(tag.id);
                  return next;
                })}>
                {open ? '⌄' : '›'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
