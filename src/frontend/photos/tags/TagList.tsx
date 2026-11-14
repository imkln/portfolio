import type { ReactNode } from 'react';
import type { Tag } from '../tagsApi';

export type TagState = 'all' | 'some' | 'none';

export default function TagList({ tags, state, onSelect, search = '', action }: {
  tags: Tag[];
  state: (id: string) => TagState;
  onSelect: (id: string) => void;
  search?: string;
  action?: (tag: Tag, path: string) => ReactNode;
}) {
  const ordered = [...tags].sort((a, b) => a.name.localeCompare(b.name));
  const paths = new Map<string, string>();
  const rows: { tag: Tag; depth: number }[] = [];

  function addRows(parent?: string, depth = 0, path = '') {
    for (const tag of ordered.filter((item) => item.parentId === parent)) {
      const name = path ? path + ' › ' + tag.name : tag.name;
      paths.set(tag.id, name);
      rows.push({ tag, depth });
      addRows(tag.id, depth + 1, name);
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

        return (
          <div className="tag-row" key={tag.id} style={{ paddingInlineStart: Math.min(depth, 8) * 12 }}>
            {action ? (
              <>
                <span>{tag.name}</span>
                {action(tag, paths.get(tag.id) ?? tag.name)}
              </>
            ) : (
              <button type="button" aria-label={paths.get(tag.id)} aria-pressed={value === 'some' ? 'mixed' : value === 'all'} onClick={() => onSelect(tag.id)}>
                {query ? paths.get(tag.id) : tag.name}
                {value !== 'none' && <span className="tag-mark" aria-hidden="true">{value === 'all' ? '✓' : '−'}</span>}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
