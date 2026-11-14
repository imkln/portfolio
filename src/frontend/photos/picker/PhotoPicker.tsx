import { useId, useState } from 'react';
import Dialog from '../../shared/dialog/Dialog';
import type { Photo } from '../Photo';
import usePhotoLibrary from '../usePhotoLibrary';
import PhotoGrid from '../grid/PhotoGrid';
import ActionIcon from '../../shared/action-bar/ActionIcon';
import TagFilter from '../tags/TagFilter';
import useTags from '../tags/useTags';
import './PhotoPicker.css';

type Props = {
  title: string;
  onChoose: (photo: Photo) => void;
  onClose: () => void;
};

export default function PhotoPicker({ title, onChoose, onClose }: Props) {
  const titleId = useId();
  const [filters, setFilters] = useState<string[]>([]);
  const { tags, tagError } = useTags();
  const library = usePhotoLibrary(filters);

  return (
    <Dialog className="photo-picker" aria-labelledby={titleId} onDismiss={onClose}>
      <header className="photo-picker-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="photo-picker-close" aria-label="Close photo picker" onClick={onClose}>
          <ActionIcon name="close" />
        </button>
      </header>

      {tagError && <p role="alert">Could not load tags.</p>}
      {!tagError && <TagFilter tags={tags} selected={filters} onChange={setFilters} />}
      <div className="photo-picker-content">
        <PhotoGrid
          library={library}
          selected={null}
          onActivate={(photo) => {
            onChoose(photo);
            onClose();
          }}
        />
      </div>
    </Dialog>
  );
}
