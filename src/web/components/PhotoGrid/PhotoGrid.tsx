import type { Photo } from '../../data/Photo';
import './PhotoGrid.css';

type Props = {
  photos: Photo[];
  selected: ReadonlySet<string> | null;
  onActivate: (photo: Photo, shift: boolean) => void;
};

export default function PhotoGrid({ photos, selected, onActivate }: Props) {
  return (
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
  );
}
