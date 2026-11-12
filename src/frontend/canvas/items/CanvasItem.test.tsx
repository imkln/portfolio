import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import type { BoardItem, Collection } from '../../collections/CollectionTypes';
import CanvasItem from './CanvasItem';

afterEach(cleanup);

const collection: Collection = {
  id: 'along-superior',
  title: 'Along Superior',
  metadata: 'Lake Superior',
  coverPhotoId: null,
  x: 0.1,
  y: 0.1,
  width: 0.3,
};

const actions = {
  onOpen: () => {},
  onSelect: () => {},
  onChooseCover: () => {},
  onDelete: () => {},
  onTransform: () => {},
};

const caption = {
  id: 'caption',
  kind: 'caption',
  text: 'Along the shore',
  x: 0.1,
  y: 0.1,
  width: 0.3,
  height: 0.12,
} as const;

function renderTextControls(item: BoardItem) {
  function Editor() {
    const [current, setCurrent] = useState(item);

    return (
      <CanvasItem
        collection={current}
        {...actions}
        editing
        selected
        onChange={(change) => setCurrent({ ...current, ...change })}
      />
    );
  }

  render(<Editor />);
}

it.each([collection, caption])('can toggle large text for $id', (item) => {
  renderTextControls(item);
  const toggle = screen.getByRole('button', {
    name: item.kind === 'caption' ? 'Large caption' : 'Large title',
  });

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

it.each([collection, caption])('can toggle light text for $id', (item) => {
  renderTextControls(item);
  const toggle = screen.getByRole('button', { name: 'Light text' });

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-pressed', 'true');

  fireEvent.click(toggle);

  expect(toggle).toHaveAttribute('aria-pressed', 'false');
});

it('can edit the metadata of the selected collection', () => {
  const onChange = vi.fn();
  render(
    <CanvasItem
      collection={collection}
      {...actions}
      editing
      selected
      onChange={onChange}
    />,
  );

  fireEvent.click(screen.getByRole('button', { name: 'Lake Superior' }));
  const metadata = screen.getByRole('textbox', { name: 'Collection metadata' });
  expect(metadata).toHaveAttribute('type', 'text');
  fireEvent.change(metadata, { target: { value: 'North Shore · Nov 2025' } });
  fireEvent.keyDown(metadata, { key: 'Enter' });

  expect(onChange).toHaveBeenCalledWith({ metadata: 'North Shore · Nov 2025' });
});
