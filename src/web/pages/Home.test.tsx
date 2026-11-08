import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import Home from './Home';
import { sampleCollections } from '../data/sampleCollections';

afterEach(cleanup);

it('should show the collections on Home', () => {
  render(
    <Home
      collections={sampleCollections}
      onSave={() => {}}
      onOpen={() => {}}
    />,
  );

  const collections = screen.getAllByRole('heading', { level: 2 });

  expect(collections.map((heading) => heading.textContent)).toEqual([
    'Along Superior',
    'Freight Country',
    'After the Shift',
    'Quiet Water',
  ]);
});
