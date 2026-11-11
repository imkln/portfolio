import type { MouseEvent } from 'react';
import Canvas from '../components/Canvas/Canvas';
import type { Collection } from '../data/Collection';

type Props = {
  collections: Collection[] | 'loading' | 'error';
  canEdit: boolean;
  onSave: (collections: Collection[]) => Promise<void>;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function Home(props: Props) {
  const { collections, ...canvasProps } = props;

  if (Array.isArray(collections)) {
    return (
      <Canvas
        items={collections}
        label="Collections"
        editLabel="Edit collections"
        emptyMessage="No collections yet."
        photoPickerTitle="Choose cover photo"
        addActions={[
          {
            label: 'Add collection',
            idPrefix: 'untitled-collection',
            create: (layout) => ({ ...layout, title: '', metadata: '', coverPhotoId: null }),
          },
        ]}
        {...canvasProps}
      />
    );
  }

  return (
    <main className="board-page">
      {collections === 'error' ? (
        <p role="alert">Could not load collections.</p>
      ) : (
        <p role="status">Loading collections…</p>
      )}
    </main>
  );
}
