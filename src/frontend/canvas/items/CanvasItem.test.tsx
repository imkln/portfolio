import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CanvasItem from './CanvasItem';

afterEach(cleanup);

const collection = {
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
