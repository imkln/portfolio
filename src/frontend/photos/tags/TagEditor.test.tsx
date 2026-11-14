import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { samplePhotos } from '../../testutils/samplePhotos';
import { createTag, deleteTag, editPhotoTags } from '../tagsApi';
import TagEditor from './TagEditor';
import TagManager from './TagManager';

vi.mock('../tagsApi', () => ({
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  editPhotoTags: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  if (!HTMLDialogElement.prototype.showModal) {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = true; },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value(this: HTMLDialogElement) { this.open = false; },
    });
  }
});

afterEach(cleanup);

const france = { id: 'france', name: 'France' };
const paris = { id: 'paris', name: 'Paris', parentId: france.id };

function openEditor(overrides: Partial<ComponentProps<typeof TagEditor>> = {}) {
  const callbacks = { onCreated: vi.fn(), onApplied: vi.fn(), onClose: vi.fn() };
  render(<TagEditor tags={[france, paris]} photos={[
    { ...samplePhotos[0], tagIds: [france.id] }, samplePhotos[1],
  ]} {...callbacks} {...overrides} />);
  return callbacks;
}

function button(name: string) {
  return screen.getByRole('button', { name });
}

function click(name: string) {
  fireEvent.click(button(name));
}

function prepareNestedTag() {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Nice' } });
  click('Create “Nice”');
  click('Parent: None');
  click('France');
  click('Create');
}

it('can add a tag to all', () => {
  openEditor();

  click('France');

  expect(button('France')).toHaveAttribute('aria-pressed', 'true');
});

it('can remove a tag from all', () => {
  openEditor({ photos: samplePhotos.slice(0, 2).map((photo) => ({ ...photo, tagIds: [france.id] })) });

  click('France');

  expect(button('France')).toHaveAttribute('aria-pressed', 'false');
});

it('can restore a mixed tag', () => {
  openEditor();
  click('France');
  click('France');

  click('France');

  expect(button('France')).toHaveAttribute('aria-pressed', 'mixed');
  expect(button('Apply changes')).toBeDisabled();
});

it('can cancel tag edits', () => {
  const { onClose } = openEditor();
  click('France');

  click('Cancel');

  expect(onClose).toHaveBeenCalledOnce();
  expect(editPhotoTags).not.toHaveBeenCalled();
});

it('can create a nested tag before applying assignments', async () => {
  const nice = { id: 'nice', name: 'Nice', parentId: france.id };
  vi.mocked(createTag).mockResolvedValue(nice);
  const { onCreated } = openEditor();

  prepareNestedTag();

  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(nice));
  expect(createTag).toHaveBeenCalledWith('Nice', france.id);
  expect(editPhotoTags).not.toHaveBeenCalled();
});

it('can retry saving tag edits', async () => {
  vi.mocked(editPhotoTags).mockRejectedValueOnce(new Error('Could not update photo tags.'));
  const { onApplied } = openEditor();
  click('France');
  click('Apply changes');
  await screen.findByRole('alert');

  click('Apply changes');

  await waitFor(() => expect(onApplied).toHaveBeenCalledOnce());
  expect(editPhotoTags).toHaveBeenLastCalledWith(['sample-1', 'sample-2'], ['france'], []);
});

it('should explain why a tag cannot be deleted', async () => {
  const message = 'France can’t be deleted because it has subtags.';
  vi.mocked(deleteTag).mockRejectedValue(new Error(message));
  render(<TagManager tags={[france, paris]} onCreated={vi.fn()} onDeleted={vi.fn()} onClose={vi.fn()} />);
  click('Delete France');

  click('Delete tag');

  expect(await screen.findByRole('alert')).toHaveTextContent(message);
  expect(screen.queryByRole('button', { name: 'Delete tag' })).not.toBeInTheDocument();
});
