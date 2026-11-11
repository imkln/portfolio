import '@testing-library/jest-dom/vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { CanvasItem } from '../collections/CollectionTypes';
import Canvas from './Canvas';

afterEach(cleanup);

const collections = [
  {
    id: 'along-superior',
    title: 'Along Superior',
    metadata: 'Lake Superior',
    coverPhotoId: null,
    x: 0.1,
    y: 0.1,
    width: 0.3,
  },
  {
    id: 'quiet-water',
    title: 'Quiet Water',
    metadata: 'Lake Huron',
    coverPhotoId: null,
    x: 0.5,
    y: 0.2,
    width: 0.3,
  },
];

function renderBoard() {
  render(
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
      canEdit
      onSave={async () => {}}
      onOpen={() => {}}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit collections' }));
}

it('can add a blank collection at the end', () => {
  renderBoard();
  const board = screen.getByRole('region', { name: 'Collections' });
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 650),
  );

  fireEvent.click(screen.getByRole('button', { name: 'Add collection' }));

  const items = screen.getAllByRole('article');
  expect(items).toHaveLength(3);
  const added = within(items[2]);
  expect(added.getByText('Untitled collection')).toBeVisible();
  expect(added.getByText('Add metadata')).toBeVisible();
  expect(added.queryByRole('img')).not.toBeInTheDocument();
});

it('can select a collection in edit mode', () => {
  renderBoard();

  const first = within(screen.getByRole('article', { name: 'Along Superior' }));
  const second = within(screen.getByRole('article', { name: 'Quiet Water' }));
  expect(
    first.queryByRole('button', { name: 'Delete collection' }),
  ).not.toBeInTheDocument();

  fireEvent.click(first.getByRole('button', { name: 'Select Along Superior' }));

  expect(
    first.getByRole('button', { name: 'Delete collection' }),
  ).toBeVisible();

  fireEvent.click(second.getByRole('button', { name: 'Quiet Water' }));

  expect(
    second.getByRole('button', { name: 'Delete collection' }),
  ).toBeVisible();
  expect(
    first.queryByRole('button', { name: 'Delete collection' }),
  ).not.toBeInTheDocument();

  fireEvent.click(first.getByRole('button', { name: 'Lake Superior' }));

  expect(
    first.getByRole('button', { name: 'Delete collection' }),
  ).toBeVisible();
});

function renderCollectionCanvas() {
  render(
    <Canvas<CanvasItem>
      items={[]}
      canEdit
      label="Collection canvas"
      editLabel="Edit canvas"
      emptyMessage="No items yet."
      photoPickerTitle="Choose photo"
      addActions={[
        {
          label: 'Add caption',
          idPrefix: 'caption',
          create: (layout) => ({ ...layout, kind: 'caption', text: 'New caption', height: 0.12 }),
        },
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
      ]}
      onSave={async () => {}}
    />,
  );

  const canvas = screen.getByRole('region', { name: 'Collection canvas' });
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 1000, 650),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit canvas' }));
}

it('shows only the configured add actions', () => {
  renderCollectionCanvas();

  const actions = screen.getAllByRole('button', { name: /^Add / });
  expect(actions.map((button) => button.textContent?.trim())).toEqual([
    '+ Add caption',
    '+ Add photo',
  ]);
});
