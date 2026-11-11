import { useEffect, useState } from 'react';
import Canvas from '../components/Canvas/Canvas';
import type { CanvasItem, CollectionDetail } from '../data/Collection';

export default function Collection({ id, canEdit }: { id: string; canEdit: boolean }) {
  const [items, setItems] = useState<CanvasItem[] | 'loading' | 'missing' | 'error'>('loading');
  const url = `/api/collections/${id}`;

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      try {
        const response = await fetch(url, { signal });
        if (response.status === 404) {
          if (!signal.aborted) setItems('missing');
          return;
        }
        if (!response.ok) throw new Error('Could not load collection');

        const collection: CollectionDetail = await response.json();
        if (!Array.isArray(collection.items)) throw new Error('Invalid collection response');
        if (!signal.aborted) setItems(collection.items);
      } catch {
        if (!signal.aborted) setItems('error');
      }
    }

    void load();
    return () => controller.abort();
  }, [url]);

  async function saveItems(updated: CanvasItem[]) {
    const items = updated.map((item) => {
      if (item.kind === 'caption') return item;

      const { coverPhotoUrl, ...photo } = item;
      return photo;
    });

    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) throw new Error('Could not save collection');
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
