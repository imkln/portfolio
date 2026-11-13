import type { Tag } from '../photos/tagsApi.ts';
import type { Photo } from '../photos/Photo.ts';
import { samplePhotos } from './samplePhotos.ts';

const libraryPath = '/api/photos';
const uploadPath = '/test-photo-uploads/';

type Upload = { photo: Photo; file?: Blob };

export function isPhotoRequest(path: string) {
  return path === '/api/tags' || path.startsWith('/api/tags/') || path === libraryPath || path.startsWith(libraryPath + '/') ||
    path.startsWith(uploadPath);
}

export function createFakePhotosApi(initialPhotos: Photo[] = samplePhotos, initialTags: Tag[] = []) {
  const photos = new Map(initialPhotos.map((photo) => [photo.id, photo]));
  const tags = new Map(initialTags.map((tag) => [tag.id, tag]));
  const uploads = new Map<string, Upload>();
  const received: string[] = [];
  let nextId = 1;

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api/tags') {
      if (request.method === 'GET') return Response.json([...tags.values()]);

      const { name, parentId } = await request.json();
      const tag = { id: `tag-${nextId++}`, name, parentId };
      tags.set(tag.id, tag);
      return Response.json(tag, { status: 201 });
    }

    if (pathname.startsWith('/api/tags/') && request.method === 'DELETE') {
      const id = pathname.slice('/api/tags/'.length);
      const tag = tags.get(id);
      if (!tag) return new Response(null, { status: 404 });
      if ([...tags.values()].some((item) => item.parentId === id)) {
        return Response.json({ error: `${tag.name} can’t be deleted because it has subtags.` }, { status: 409 });
      }
      tags.delete(id);
      for (const photo of photos.values()) {
        photos.set(photo.id, { ...photo, tagIds: photo.tagIds?.filter((tagId) => tagId !== id) });
      }
      return new Response(null, { status: 204 });
    }

    if (pathname === libraryPath) {
      if (request.method === 'PATCH') {
        const { photoIds, addTagIds, removeTagIds }: { photoIds: string[]; addTagIds: string[]; removeTagIds: string[] } = await request.json();
        if (photoIds.some((id) => !photos.has(id)) || addTagIds.some((id) => !tags.has(id))) {
          return new Response(null, { status: 404 });
        }
        for (const id of photoIds) {
          const photo = photos.get(id)!;
          const tagIds = new Set(photo.tagIds);
          for (const tag of addTagIds) tagIds.add(tag);
          for (const tag of removeTagIds) tagIds.delete(tag);
          photos.set(id, { ...photo, tagIds: [...tagIds] });
        }
        return new Response(null, { status: 204 });
      }

      if (request.method === 'POST') {
        const { name } = await request.json();
        const id = `upload-${nextId++}`;
        uploads.set(id, {
          photo: { id, name, uploadedAt: new Date().toISOString(), original: '', thumbnail: '' },
        });

        return Response.json(
          { url: uploadPath + id, fields: { key: id } },
          { status: 201 },
        );
      }

      const filters = url.searchParams.getAll('tagId');
      const all = [...photos.values()].filter((photo) => filters.every((filter) => photo.tagIds?.some((id) => {
        for (let tag = tags.get(id); tag; tag = tag.parentId ? tags.get(tag.parentId) : undefined) {
          if (tag.id === filter) return true;
        }
        return false;
      }))).sort(
        (a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt),
      );
      const start = Number(url.searchParams.get('pageToken') ?? 0);
      const end = start + 24;

      return Response.json({
        photos: all.slice(start, end).map(details),
        nextPageToken: end < all.length ? String(end) : undefined,
      });
    }

    if (pathname.startsWith(uploadPath)) {
      const upload = uploads.get(pathname.slice(uploadPath.length));
      if (!upload || request.method !== 'POST') return new Response(null, { status: 404 });

      const body = await request.formData();
      const file = body.get('file');
      if (body.get('key') !== upload.photo.id || !(file instanceof Blob)) {
        return new Response(null, { status: 400 });
      }
      upload.file = file;
      received.push(upload.photo.name);
      photos.set(upload.photo.id, upload.photo);
      return new Response(null, { status: 204 });
    }

    const [id, asset] = pathname.slice(libraryPath.length + 1).split('/');
    const photo = photos.get(id);
    if (!photo) return new Response(null, { status: 404 });

    if (request.method === 'DELETE') {
      photos.delete(id);
      uploads.delete(id);
      return new Response(null, { status: 204 });
    }

    const upload = uploads.get(id);
    if (upload?.file) {
      return new Response(upload.file, { headers: { 'Content-Type': 'image/jpeg' } });
    }

    const image = asset === 'thumbnail' ? photo.thumbnail : photo.original;
    if (image.startsWith('/')) {
      return new Response(null, { status: 302, headers: { Location: image } });
    }

    return new Response(decodeURIComponent(image.slice(image.indexOf(',') + 1)), {
      headers: { 'Content-Type': 'image/svg+xml' },
    });
  }

  return { handle, received };
}

function details({ id, name, uploadedAt, tagIds }: Photo) {
  return { id, name, uploadedAt, tagIds };
}
