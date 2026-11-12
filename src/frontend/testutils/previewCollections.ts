import type { CanvasItem, Collection } from '../collections/CollectionTypes.ts';
import { sampleCollections } from './sampleCollections.ts';

const cover = (name: string) => `/testutils/preview-photos/${name}.jpg`;

export const previewCollections: Collection[] = [
  {
    ...sampleCollections[0],
    coverPhotoUrl: cover('shore'),
    x: 0.37,
    y: 0,
    width: 0.63,
    textLayout: { x: 0, y: 0.12, width: 0.35 },
    largeText: true,
  },
  {
    ...sampleCollections[1],
    coverPhotoUrl: cover('freight'),
    x: 0,
    y: 0.46,
    width: 0.39,
    textLayout: { x: 0.02, y: 0.63, width: 0.35 },
    lightText: true,
  },
  {
    ...sampleCollections[2],
    coverPhotoUrl: cover('stairs'),
    x: 0.45,
    y: 0.51,
    width: 0.55,
  },
  {
    ...sampleCollections[3],
    coverPhotoUrl: cover('water'),
    x: 0.06,
    y: 0.84,
    width: 0.32,
  },
];

export const previewCollectionItems: CanvasItem[] = [
  {
    id: 'ore-dock-photo',
    kind: 'photo',
    coverPhotoId: 'ore-dock',
    coverPhotoUrl: cover('shore'),
    x: 0,
    y: 0,
    width: 0.76,
  },
  {
    id: 'shore-caption',
    kind: 'caption',
    text: 'The last light along the shore.',
    x: 0.04,
    y: 0.37,
    width: 0.34,
    height: 0.12,
    lightText: true,
  },
];
