import { samplePhotos } from './samplePhotos.ts';

const libraryPath = '/api/photos';
const uploadPath = '/test-photo-uploads/';

type Photo = (typeof samplePhotos)[number];
type Upload = { photo: Photo; file?: Blob };

export function isPhotoRequest(path: string) {
  return path === libraryPath || path.startsWith(libraryPath + '/') ||
    path.startsWith(uploadPath);
}

export function createFakePhotosApi(initialPhotos = samplePhotos) {
  const photos = new Map(initialPhotos.map((photo) => [photo.id, photo]));
  const uploads = new Map<string, Upload>();
  const received: string[] = [];
  let nextId = 1;

  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === libraryPath) {
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

      const all = Array.from(photos.values()).sort(
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

function details({ id, name, uploadedAt }: Photo) {
  return { id, name, uploadedAt };
}
