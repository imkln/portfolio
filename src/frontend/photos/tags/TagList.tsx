import type { ReactNode } from 'react';
import type { Tag } from '../tagsApi';

export type TagState = 'all' | 'some' | 'none';

export function tagRows(tags: Tag[]) {
  const children = new Map<string | undefined, Tag[]>();
  for (const tag of [...tags].sort((a, b) => a.name.localeCompare(b.name))) {
    const siblings = children.get(tag.parentId) ?? [];
    siblings.push(tag);
    children.set(tag.parentId, siblings);
  }

  const rows: { tag: Tag; depth: number; path: string }[] = [];
  function visit(parentId?: string, depth = 0, parentPath = '') {
    for (const tag of children.get(parentId) ?? []) {
      const path = parentPath ? parentPath + ' › ' + tag.name : tag.name;
      rows.push({ tag, depth, path });
      visit(tag.id, depth + 1, path);
    }
  }

  visit();
  return rows;
}

export function TagRows({ rows, children }: {
  rows: ReturnType<typeof tagRows>;
  children: (row: ReturnType<typeof tagRows>[number]) => ReactNode;
}) {
  return (
    <div className="tag-list">
      {rows.map((row) => (
        <div className="tag-row" key={row.tag.id} style={{ paddingInlineStart: Math.min(row.depth, 8) * 12 }}>
          {children(row)}
        </div>
      ))}
    </div>
  );
}

export default function TagList({ rows, state, onSelect, showPaths = false }: {
  rows: ReturnType<typeof tagRows>;
  state: (id: string) => TagState;
  onSelect: (id: string) => void;
  showPaths?: boolean;
}) {
  return (
    <TagRows rows={rows}>
      {({ tag, path }) => {
        const value = state(tag.id);
        return (
          <button type="button" aria-label={path} aria-pressed={value === 'some' ? 'mixed' : value === 'all'} onClick={() => onSelect(tag.id)}>
            {showPaths ? path : tag.name}
            {value !== 'none' && <span className="tag-mark" aria-hidden="true">{value === 'all' ? '✓' : '−'}</span>}
          </button>
        );
      }}
    </TagRows>
  );
}
