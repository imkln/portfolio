export type Tag = { id: string; name: string; parentId?: string };

export async function listTags(signal?: AbortSignal): Promise<Tag[]> {
  const response = await fetch('/api/tags', { signal });
  if (!response.ok) throw new Error('Could not load tags.');
  return response.json();
}

export async function createTag(name: string, parentId?: string): Promise<Tag> {
  const response = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId }),
  });
  if (!response.ok) throw await tagError(response, 'Could not create tag.');
  return response.json();
}

export async function deleteTag(id: string) {
  const response = await fetch('/api/tags/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!response.ok) throw await tagError(response, 'Could not delete tag.');
}

export async function editPhotoTags(photoIds: string[], addTagIds: string[], removeTagIds: string[]) {
  const response = await fetch('/api/photos', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoIds, addTagIds, removeTagIds }),
  });
  if (!response.ok) throw new Error('Could not update photo tags.');
}

async function tagError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return new Error(body?.error ?? fallback);
}
