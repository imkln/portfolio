import type { Photo, PhotoDetails } from './Photo';

const photosPath = '/api/photos';

function photoPath(id: string) {
  return `${photosPath}/${encodeURIComponent(id)}`;
}

function withImageUrls(photo: PhotoDetails): Photo {
  const original = photoPath(photo.id);
  return { ...photo, original, thumbnail: `${original}/thumbnail` };
}

export async function listPhotos(signal: AbortSignal, pageToken?: string) {
  const url = pageToken
    ? `${photosPath}?${new URLSearchParams({ pageToken })}`
    : photosPath;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Could not load photos');

  const page: { photos: PhotoDetails[]; nextPageToken?: string } =
    await response.json();
  return {
    photos: page.photos.map(withImageUrls),
    nextPageToken: page.nextPageToken,
  };
}

export async function uploadPhoto(file: File, signal: AbortSignal) {
  const response = await fetch(photosPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, contentType: 'image/jpeg', size: file.size }),
    signal,
  });
  if (!response.ok) {
    throw new Error('Could not prepare photo upload');
  }

  const form: { url: string; fields: Record<string, string> } =
    await response.json();
  const body = new FormData();
  for (const [name, value] of Object.entries(form.fields)) {
    body.append(name, value);
  }
  body.append('file', file);

  const uploaded = await fetch(form.url, { method: 'POST', body, signal });
  if (!uploaded.ok) throw new Error('Could not upload photo');

}

export async function deletePhoto(id: string, signal: AbortSignal) {
  const response = await fetch(photoPath(id), { method: 'DELETE', signal });
  if (!response.ok && response.status !== 404) {
    throw new Error('Could not delete photo');
  }
}
