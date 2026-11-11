import type { CSSProperties, MouseEvent, PointerEvent, ReactNode } from 'react';
import type { BoardItem, BoardItemChange, Collection } from '../../collections/CollectionTypes';
import PhotoCanvasItem from './PhotoCanvasItem';
import TextCanvasItem from './TextCanvasItem';
import './CanvasItem.css';

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

export default function CanvasItem(props: Props) {
  const { collection, editing, selected, onChange, onSelect, onTransform } = props;
  if (collection.kind === undefined) {
    return <CollectionCanvasItem {...props} collection={collection} />;
  }

  const content = collection.kind === 'caption' ? (
    <TextCanvasItem
      multiline
      label="Caption text"
      value={collection.text}
      placeholder="Add text"
      editing={editing}
      selected={selected}
      onChange={(text) => onChange({ text })}
      onSelect={onSelect}
      onMove={(event) => onTransform(event, 'move')}
    />
  ) : (
    <PhotoCanvasItem photoId={collection.coverPhotoId} photoUrl={collection.coverPhotoUrl} />
  );

  return <CanvasItemFrame {...props} content={content} />;
}

function CollectionCanvasItem({ collection, ...props }: Props & { collection: Collection }) {
  const cover = <PhotoCanvasItem photoId={collection.coverPhotoId} photoUrl={collection.coverPhotoUrl} />;
  const { editing, selected, onSelect, onChange } = props;

  return (
    <CanvasItemFrame {...props} collection={collection} content={cover}>
      <h2 className="collection-title">
        <TextCanvasItem
          label="Collection title"
          value={collection.title}
          placeholder="Untitled collection"
          editing={editing}
          selected={selected}
          onSelect={onSelect}
          onChange={(title) => onChange({ title })}
        />
      </h2>
      <p className="collection-metadata">
        <TextCanvasItem
          label="Collection metadata"
          value={collection.metadata}
          placeholder={editing ? 'Add metadata' : undefined}
          editing={editing}
          selected={selected}
          onSelect={onSelect}
          onChange={(metadata) => onChange({ metadata })}
        />
      </p>
    </CanvasItemFrame>
  );
}

function CanvasItemFrame({
  collection,
  rowIndex,
  editing,
  selected,
  onOpen,
  onSelect,
  onChooseCover,
  onDelete,
  onTransform,
  content,
  children,
}: Props & { content: ReactNode; children?: ReactNode }) {
  const { id, kind, x, y, width } = collection;
  const displayTitle = kind
    ? kind === 'caption' ? 'Caption' : 'Photo'
    : collection.title || 'Untitled collection';
  const itemType = kind ?? 'collection';
  const layout = {
    '--x': x,
    '--y': y,
    '--width': width,
    '--row-index': rowIndex,
    '--height': kind === 'caption' ? collection.height : undefined,
  } as CSSProperties;

  function pressCover(event: PointerEvent<HTMLButtonElement>) {
    if (selected && event.button === 0) onTransform(event, 'move');
  }

  return (
    <article
      aria-label={displayTitle}
      className={selected ? 'collection selected' : 'collection'}
      style={layout}
    >
      <div className={kind === 'caption' ? 'collection-cover canvas-caption' : 'collection-cover'}>
        {kind === 'caption' ? content : editing ? (
          <button
            type="button"
            className="cover-control"
            aria-label={`Select ${displayTitle}`}
            aria-pressed={selected}
            onClick={onSelect}
            onPointerDown={pressCover}
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

      {children}
    </article>
  );
}
