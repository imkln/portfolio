import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import type { Collection as CollectionData } from '../../data/Collection';
import Cover from './Cover';
import EditableLine from './EditableLine';
import './Collection.css';

export type Transform = 'move' | 'resize';

type Props = {
  collection: CollectionData;
  rowIndex?: number;
  editing: boolean;
  selected: boolean;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
  onSelect: () => void;
  onChange: (change: Partial<CollectionData>) => void;
  onDelete: () => void;
  onTransform: (event: PointerEvent<HTMLElement>, action: Transform) => void;
};

export default function Collection({
  collection,
  rowIndex,
  editing,
  selected,
  onOpen,
  onSelect,
  onChange,
  onDelete,
  onTransform,
}: Props) {
  const { id, title, metadata, coverPhotoId, x, y, width } = collection;
  const displayTitle = title || 'Untitled collection';
  const layout = {
    '--x': x,
    '--y': y,
    '--width': width,
    '--row-index': rowIndex,
  } as CSSProperties;

  return (
    <article
      aria-label={displayTitle}
      className={selected ? 'collection selected' : 'collection'}
      style={layout}
    >
      <div className="collection-cover">
        {editing ? (
          <button
            type="button"
            className="cover-control"
            aria-label={`Select ${displayTitle}`}
            aria-pressed={selected}
            onClick={onSelect}
            onPointerDown={
              selected ? (event) => onTransform(event, 'move') : undefined
            }
          >
            <Cover photoId={coverPhotoId} />
          </button>
        ) : (
          <a
            className="cover-control"
            href={`/collections/${id}`}
            aria-label={displayTitle}
            onClick={onOpen}
          >
            <Cover photoId={coverPhotoId} />
          </a>
        )}

        {selected && (
          <>
            <button
              type="button"
              className="delete-collection"
              aria-label="Delete collection"
              title="Delete collection"
              onClick={onDelete}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16m-10 0V4h4v3m4 0-1 13H7L6 7m4 4v5m4-5v5" />
              </svg>
            </button>
            <span
              className="resize-notch"
              aria-hidden="true"
              onPointerDown={(event) => onTransform(event, 'resize')}
            />
          </>
        )}
      </div>

      <h2 className="collection-title">
        {editing ? (
          <EditableLine
            label="Collection title"
            value={title}
            placeholder="Untitled collection"
            selected={selected}
            onSelect={onSelect}
            onChange={(value) => onChange({ title: value })}
          />
        ) : (
          displayTitle
        )}
      </h2>
      <p className="collection-metadata">
        {editing ? (
          <EditableLine
            label="Collection metadata"
            value={metadata}
            placeholder="Add metadata"
            selected={selected}
            onSelect={onSelect}
            onChange={(value) => onChange({ metadata: value })}
          />
        ) : (
          metadata
        )}
      </p>
    </article>
  );
}
