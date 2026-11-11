import Canvas from '../components/Canvas/Canvas';
import Cover from '../components/Collection/Cover';
import type { CanvasItem, Collection as CollectionData } from '../data/Collection';
import './Collection.css';

export default function Collection({
  collection,
  canEdit,
  onSaveCanvas,
}: {
  collection: CollectionData;
  canEdit: boolean;
  onSaveCanvas: (items: CanvasItem[]) => Promise<void>;
}) {
  if (collection.canvas) {
    return (
      <Canvas
        items={collection.canvas.items}
        label="Collection canvas"
        editLabel="Edit canvas"
        emptyMessage="No photos or captions yet."
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
        onSave={onSaveCanvas}
      />
    );
  }

  return (
    <main className="collection-page">
      <h1>{collection.title || 'Untitled collection'}</h1>
      <p className="collection-metadata">{collection.metadata}</p>
      <Cover
        photoId={collection.coverPhotoId}
        photoUrl={collection.coverPhotoUrl}
      />
    </main>
  );
}
