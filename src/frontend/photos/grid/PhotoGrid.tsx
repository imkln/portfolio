import type { RefObject } from 'react';
import type { Photo } from '../Photo';
import './PhotoGrid.css';

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
      {(!loadError || photos.length > 0) && (
        <section aria-label="Photos" className="photo-grid">
          {photos.length === 0 && <p>No photos yet.</p>}
          {photos.map((photo) => {
            const checked = selected?.has(photo.id);

            return (
              <button
                key={photo.id}
                className="photo-tile"
                type="button"
                aria-pressed={checked}
                onClick={(event) => onActivate(photo, event.shiftKey)}
              >
                <img src={photo.thumbnail} alt={photo.name} loading="lazy" />
                {selected && (
                  <span className="photo-check" aria-hidden="true">
                    {checked ? '✓' : ''}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      )}
      {hasMore && <div ref={nextPage} className="photo-page-end" />}
    </>
  );
}
