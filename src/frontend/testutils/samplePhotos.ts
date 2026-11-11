import type { Photo } from '../photos/Photo.ts';

const palettes = [
  ['#e6ad94', '#547783', '#586969', '#273b42'],
  ['#9eb2c6', '#42627b', '#677b81', '#293f52'],
  ['#e2be91', '#7b8175', '#816d54', '#413e35'],
  ['#bac5cb', '#657d79', '#717a66', '#3c4c4b'],
];

function landscape(index: number, width: number) {
  const [sky, water, hills, shore] = palettes[index % palettes.length];
  const peak = 290 + (index * 47) % 210;
  const scene = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="${width}" height="${width * 2 / 3}">
    <rect width="600" height="400" fill="${sky}"/>
    <circle cx="${190 + (index * 29) % 180}" cy="113" r="32" fill="#fff3db" opacity=".62"/>
    <path d="M0 227L130 162 234 218 ${peak} 118 600 205V400H0Z" fill="${hills}"/>
    <path d="M0 242Q196 225 370 238T600 224V400H0Z" fill="${water}"/>
    <path d="M0 281H356M61 308H285M0 345H200M122 369H254" stroke="${sky}" stroke-width="3" opacity=".4"/>
    <path d="M600 251Q482 260 430 309T274 400H600Z" fill="${shore}"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(scene)}`;
}

export const samplePhotos: Photo[] = Array.from({ length: 48 }, (_, index) => ({
  id: `sample-${index + 1}`,
  name: `Photo ${index + 1}`,
  uploadedAt: new Date(Date.UTC(2026, 0, 1) - index * 1000).toISOString(),
  thumbnail: landscape(index, 360),
  original: landscape(index, 1200),
}));
