import type { MouseEvent } from 'react';
import Canvas from '../../features/collections/components/canvas/Canvas';
import PhotoPicker from '../../features/photos/components/picker/PhotoPicker';
import { useCollections, useSaveCollections } from '../../features/collections/api/collectionsApi';

type Props = {
  canEdit: boolean;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function Home({ canEdit, onOpen }: Props) {
  const { data: collections, isError } = useCollections();
  const { mutateAsync: saveCollections } = useSaveCollections();

  if (collections) {
    return (
      <Canvas
        items={collections}
        label="Collections"
        editLabel="Edit collections"
        emptyMessage="No collections yet."
        PhotoPicker={PhotoPicker}
        photoPickerTitle="Choose cover photo"
        addActions={[
          {
            label: 'Add collection',
            idPrefix: 'untitled-collection',
            create: (layout) => ({ ...layout, title: '', metadata: '', coverPhotoId: null }),
          },
        ]}
        canEdit={canEdit}
        onSave={saveCollections}
        onOpen={onOpen}
      />
    );
  }

  return (
    <main className="board-page">
      {isError ? (
        <p role="alert">Could not load collections.</p>
      ) : (
        <p role="status">Loading collections…</p>
      )}
    </main>
  );
}
