import type { Photo } from '../photos/Photo.ts';

const photos = [
  ['shore', 'Lake Superior shoreline'],
  ['hiker', 'Hiker beneath the pines'],
  ['freight', 'Freight shed'],
  ['fern', 'Rain on a fern'],
  ['waterfall', 'Woodland waterfall'],
  ['stairs', 'Steel stairs'],
  ['water', 'Quiet lake'],
  ['shore-detail', 'Basalt at the waterline'],
  ['freight-detail', 'Along the sidings'],
  ['stairs-detail', 'Stair landing'],
  ['water-detail', 'Pines in the mist'],
];

export const previewPhotos: Photo[] = photos.map(([id, name], index) => {
  const image = `/testutils/preview-photos/${id}.jpg`;
  return {
    id,
    name,
    uploadedAt: new Date(Date.UTC(2026, 0, 1) - index * 1000).toISOString(),
    original: image,
    thumbnail: image,
  };
});
