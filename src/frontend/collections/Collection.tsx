import { useEffect, useState } from 'react';
import Canvas from '../canvas/Canvas';
import { fetchCollectionItems, updateCollectionItems } from './collectionsApi';
import type { CanvasItem } from './CollectionTypes';

export default function Collection({ id, canEdit }: { id: string; canEdit: boolean }) {
  const [items, setItems] = useState<CanvasItem[] | 'loading' | 'missing' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const loaded = await fetchCollectionItems(id, signal);
        if (!signal.aborted) setItems(loaded ?? 'missing');
      } catch {
        if (!signal.aborted) setItems('error');
      }
    }

    void load();
    return () => controller.abort();
  }, [id]);

  async function saveItems(updated: CanvasItem[]) {
    await updateCollectionItems(id, updated);
    setItems(updated);
  }

  if (!Array.isArray(items)) {
    return (
      <main className="board-page">
        {items === 'loading' ? (
          <p role="status">Loading collection…</p>
        ) : (
          <p role="alert">{items === 'missing' ? 'Collection not found.' : 'Could not load collection.'}</p>
        )}
      </main>
    );
  }

  return (
    <Canvas
      items={items}
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
      onSave={saveItems}
    />
  );
}
