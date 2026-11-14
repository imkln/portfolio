import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { Photo } from '../Photo';
import './PhotoGrid.css';

const gap = 8;
const placeholderRatio = 3 / 2;

type Props = {
  library: {
    photos: Photo[];
    loading: boolean;
    loadError: boolean;
    hasMore: boolean;
    nextPage: RefObject<HTMLDivElement | null>;
  };
  selected: ReadonlySet<string> | null;
  onActivate: (photo: Photo, shift: boolean) => void;
};

export default function PhotoGrid({ library, selected, onActivate }: Props) {
  const { photos, loading, loadError, hasMore, nextPage } = library;

  if (loading) return <p role="status">Loading photos…</p>;

  return (
    <>
      {loadError && <p role="alert">Could not load photos.</p>}
      {(photos.length > 0 || (!loadError && !hasMore)) && (
        <PhotoTiles photos={photos} selected={selected} onActivate={onActivate} />
      )}
      {hasMore && <div ref={nextPage} className="photo-page-end" />}
    </>
  );
}

function PhotoTiles({ photos, selected, onActivate }: Pick<Props, 'selected' | 'onActivate'> & {
  photos: Photo[];
}) {
  const grid = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [ratios, setRatios] = useState<Record<string, number>>({});

  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;

    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = width >= 720 ? 4 : width >= 480 ? 3 : 2;
  const tileWidth = Math.max(0, (width - gap * (columns - 1)) / columns);
  const columnEnds = Array<number>(columns).fill(0);
  const tiles = photos.map((photo) => {
    const top = Math.min(...columnEnds);
    const column = columnEnds.indexOf(top);
    const height = tileWidth / (ratios[photo.thumbnail] ?? placeholderRatio);
    columnEnds[column] = top + height + gap;

    return { photo, top, height, left: column * (tileWidth + gap) };
  });
  const height = tiles.length ? Math.max(...columnEnds) - gap : undefined;

  return (
    <section ref={grid} aria-label="Photos" className="photo-grid" style={{ height }}>
      {tiles.length === 0 && <p>No photos yet.</p>}
      {tiles.map(({ photo, top, left, height }) => {
        const checked = selected?.has(photo.id);

        return (
          <button
            key={photo.id}
            className="photo-tile"
            type="button"
            style={{ top, left, width: tileWidth, height }}
            aria-pressed={checked}
            onClick={(event) => onActivate(photo, event.shiftKey)}
          >
            <img
              src={photo.thumbnail}
              alt={photo.name}
              loading="lazy"
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (!naturalWidth || !naturalHeight) return;

                const ratio = naturalWidth / naturalHeight;
                setRatios((current) => current[photo.thumbnail] === ratio
                  ? current
                  : { ...current, [photo.thumbnail]: ratio });
              }}
            />
            {selected && (
              <span className="photo-check" aria-hidden="true">
                {checked ? '✓' : ''}
              </span>
            )}
          </button>
        );
      })}
    </section>
  );
}
