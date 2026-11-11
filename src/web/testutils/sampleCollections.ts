import type { Collection } from '../data/Collection';
import { samplePhotos } from './samplePhotos';

export const sampleCoverPhoto = samplePhotos[1].original;

export const sampleCollections: Collection[] = [
  {
    id: 'along-superior',
    title: 'Along Superior',
    metadata: 'Lake Superior · Oct 2025',
    coverPhotoId: 'ore-dock',
    coverPhotoUrl: sampleCoverPhoto,
    x: 0,
    y: 0,
    width: 0.53,
  },
  {
    id: 'freight-country',
    title: 'Freight Country',
    metadata: 'Upper Midwest · Aug 2025',
    coverPhotoId: 'freight-shed',
    x: 0.61,
    y: 0.14,
    width: 0.37,
  },
  {
    id: 'after-the-shift',
    title: 'After the Shift',
    metadata: 'Industrial studies · May 2025',
    coverPhotoId: 'iron-stairs',
    x: 0.08,
    y: 0.52,
    width: 0.38,
  },
  {
    id: 'quiet-water',
    title: 'Quiet Water',
    metadata: 'North Shore · Sep 2024',
    coverPhotoId: 'misty-shore',
    x: 0.53,
    y: 0.46,
    width: 0.47,
  },
];
