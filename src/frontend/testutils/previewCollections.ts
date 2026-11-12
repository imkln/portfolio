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

const collectionNotes = [
  { photo: 'shore-detail', text: 'A last stretch of rocky shoreline before the weather turns.' },
  { photo: 'freight-detail', text: 'Along the sidings, paint and steel carry the marks of decades of work.' },
  { photo: 'stairs-detail', text: 'Late light picks out the steps and handrails after the building has emptied.' },
  { photo: 'water-detail', text: 'Pines and fog reflected in the lake before the wind came up.' },
];

export const previewItemsByCollection = Object.fromEntries(
  previewCollections.map((collection, index) => {
    const note = collectionNotes[index];
    const items: CanvasItem[] = [
      {
        id: 'cover',
        kind: 'photo',
        coverPhotoId: collection.coverPhotoId,
        coverPhotoUrl: collection.coverPhotoUrl,
        x: 0,
        y: 0,
        width: 0.6,
      },
      {
        id: 'title',
        kind: 'caption',
        text: collection.title,
        x: 0.64,
        y: 0.035,
        width: 0.36,
        height: 0.25,
        largeText: true,
      },
      {
        id: 'detail',
        kind: 'photo',
        coverPhotoId: note.photo,
        coverPhotoUrl: cover(note.photo),
        x: 0.49,
        y: 0.44,
        width: 0.51,
      },
      {
        id: 'field-note',
        kind: 'caption',
        text: note.text,
        x: 0.08,
        y: 0.49,
        width: 0.32,
        height: 0.12,
      },
    ];
    return [collection.id, items];
  }),
);
