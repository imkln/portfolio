import { useEffect, useId, useRef, useState } from 'react';
import type { Photo } from '../Photo';
import usePhotoLibrary from '../usePhotoLibrary';
import PhotoGrid from '../grid/PhotoGrid';
import TagFilter from '../tags/TagFilter';
import useTags from '../tags/useTags';
import './PhotoPicker.css';

type Props = {
  title: string;
  onChoose: (photo: Photo) => void;
  onClose: () => void;
};

export default function PhotoPicker({ title, onChoose, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [filters, setFilters] = useState<string[]>([]);
  const { tags, tagError } = useTags();
  const library = usePhotoLibrary(filters);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="photo-picker"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <header className="photo-picker-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" onClick={() => dialog.current?.close()}>
          Cancel
        </button>
      </header>

      {tagError && <p role="alert">Could not load tags.</p>}
      {!tagError && <TagFilter tags={tags} selected={filters} onChange={setFilters} />}
      <div className="photo-picker-content">
        <PhotoGrid
          library={library}
          selected={null}
          onActivate={(photo) => {
            dialog.current?.close();
            onChoose(photo);
          }}
        />
      </div>
    </dialog>
  );
}
