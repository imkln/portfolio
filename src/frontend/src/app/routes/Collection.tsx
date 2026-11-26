import Canvas from '../../features/collections/components/canvas/Canvas';
import {
  useCollectionItems,
  useSaveCollectionItems,
} from '../../features/collections/api/collectionsApi';
import PhotoPicker from '../../features/photos/components/picker/PhotoPicker';
import type { CanvasItem } from '../../features/collections/types/CollectionTypes';

export default function Collection({ id, canEdit }: { id: string; canEdit: boolean }) {
  const { data: items, isPending } = useCollectionItems(id);
  const { mutateAsync: saveItems } = useSaveCollectionItems(id);

  if (!Array.isArray(items)) {
    return (
      <main className="board-page">
        {isPending ? (
          <p role="status">Loading collection…</p>
        ) : (
          <p role="alert">
            {items === null ? 'Collection not found.' : 'Could not load collection.'}
          </p>
        )}
      </main>
    );
  }

  return (
    <Canvas<CanvasItem>
      items={items}
      label="Collection canvas"
      editLabel="Edit canvas"
      emptyMessage="No photos or captions yet."
      PhotoPicker={PhotoPicker}
      photoPickerTitle="Choose photo"
      addActions={[
        {
          label: 'Add photo',
          idPrefix: 'photo',
          choosePhoto: (layout, photo) => ({
            ...layout,
            kind: 'photo',
            coverPhotoId: photo.id,
            coverPhotoUrl: photo.original,
          }),
        },
        {
          label: 'Add caption',
          idPrefix: 'caption',
          create: (layout) => ({ ...layout, kind: 'caption', text: '', height: 0.12 }),
        },
      ]}
      canEdit={canEdit}
      onSave={saveItems}
    />
  );
}
