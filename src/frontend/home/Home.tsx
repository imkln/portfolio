import { useEffect, useState, type MouseEvent } from 'react';
import Canvas from '../canvas/Canvas';
import type { Collection } from '../collections/CollectionTypes';
import { fetchCollections, updateCollections } from '../collections/collectionsApi';

type Props = {
  canEdit: boolean;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function Home({ canEdit, onOpen }: Props) {
  const [collections, setCollections] = useState<Collection[] | 'loading' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const loaded = await fetchCollections(signal);
        if (!signal.aborted) setCollections(loaded);
      } catch {
        if (!signal.aborted) setCollections('error');
      }
    }

    void load();
    return () => controller.abort();
  }, []);

  async function saveCollections(updated: Collection[]) {
    await updateCollections(updated);

    try {
      setCollections(await fetchCollections());
    } catch {
      // The save succeeded, so keep the edits if refreshing the URLs fails.
      setCollections(updated);
    }
  }

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
        canEdit={canEdit}
        onSave={saveCollections}
        onOpen={onOpen}
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
