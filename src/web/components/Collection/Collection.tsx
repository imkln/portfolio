import { useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import type { BoardItem, BoardItemChange } from '../../data/Collection';
import Cover from './Cover';
import EditableLine from './EditableLine';
import './Collection.css';

export type Transform = 'move' | 'resize';

type Props = {
  collection: BoardItem;
  rowIndex?: number;
  editing: boolean;
  selected: boolean;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onSelect: () => void;
  onChange: (change: BoardItemChange) => void;
  onChooseCover: () => void;
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
  onChooseCover,
  onDelete,
  onTransform,
}: Props) {
  const [editingText, setEditingText] = useState(false);
  const captionPress = useRef<{ x: number; y: number; dragged: boolean } | null>(null);
  const { id, kind, x, y, width } = collection;
  const displayTitle = kind
    ? kind === 'caption' ? 'Caption' : 'Photo'
    : collection.title || 'Untitled collection';
  const itemType = kind ?? 'collection';
  const content = kind === 'caption' ? (
    <span className="canvas-caption-text">
      {collection.text || (editing ? 'Add text' : '')}
    </span>
  ) : (
    <Cover photoId={collection.coverPhotoId} photoUrl={collection.coverPhotoUrl} />
  );
  const layout = {
    '--x': x,
    '--y': y,
    '--width': width,
    '--row-index': rowIndex,
    '--height': kind === 'caption' ? collection.height : undefined,
  } as CSSProperties;

  function pressCover(event: PointerEvent<HTMLButtonElement>) {
    if (!selected || event.button !== 0) return;

    if (kind === 'caption') {
      captionPress.current = { x: event.clientX, y: event.clientY, dragged: false };
    }
    onTransform(event, 'move');
  }

  function trackCaptionPress(event: PointerEvent<HTMLButtonElement>) {
    const press = captionPress.current;
    if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 3) {
      press.dragged = true;
    }
  }

  function clickCover(event: MouseEvent<HTMLButtonElement>) {
    const dragged = event.detail > 0 && captionPress.current?.dragged;
    captionPress.current = null;

    if (kind === 'caption' && selected && !dragged) {
      setEditingText(true);
    } else {
      onSelect();
    }
  }

  return (
    <article
      aria-label={displayTitle}
      className={selected ? 'collection selected' : 'collection'}
      style={layout}
    >
      <div className={kind === 'caption' ? 'collection-cover canvas-caption' : 'collection-cover'}>
        {kind === 'caption' && editing && selected && editingText ? (
          <textarea
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            aria-label="Caption text"
            value={collection.text}
            onChange={(event) => onChange({ text: event.target.value })}
            onBlur={() => setEditingText(false)}
          />
        ) : editing ? (
          <button
            type="button"
            className="cover-control"
            aria-label={`Select ${displayTitle}`}
            aria-pressed={selected}
            onClick={clickCover}
            onPointerDown={pressCover}
            onPointerMove={kind === 'caption' ? trackCaptionPress : undefined}
          >
            {content}
          </button>
        ) : kind === undefined ? (
          <a
            className="cover-control"
            href={`/collections/${id}`}
            aria-label={displayTitle}
            onClick={onOpen}
          >
            {content}
          </a>
        ) : content}

        {selected && (
          <>
            {kind !== 'caption' && (
              <button
                type="button"
                className="choose-cover"
                aria-label={kind === 'photo' ? 'Replace photo' : 'Choose cover photo'}
                aria-haspopup="dialog"
                title={kind === 'photo' ? 'Replace photo' : 'Choose cover photo'}
                onClick={(event) => {
                  event.currentTarget.focus();
                  onChooseCover();
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <circle cx="9" cy="9" r="1.5" />
                  <path d="m3 17 5-4 3 2 5-5 5 5" />
                </svg>
              </button>
            )}
            <button
              type="button"
              className="delete-collection"
              aria-label={`Delete ${itemType}`}
              title={`Delete ${itemType}`}
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

      {kind === undefined && (
        <>
          <h2 className="collection-title">
            {editing ? (
              <EditableLine
                label="Collection title"
                value={collection.title}
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
                value={collection.metadata}
                placeholder="Add metadata"
                selected={selected}
                onSelect={onSelect}
                onChange={(value) => onChange({ metadata: value })}
              />
            ) : (
              collection.metadata
            )}
          </p>
        </>
      )}
    </article>
  );
}
