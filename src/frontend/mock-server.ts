import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createFakeCollectionsApi, isCollectionRequest } from './src/testing/fakeCollectionsApi.ts';
import { createFakePhotosApi, isPhotoRequest } from './src/testing/fakePhotosApi.ts';
import type { MockCollections, MockPhotos } from './src/testing/fakeApi.ts';

const frontend = process.env.PORTFOLIO_FRONTEND_URL;
const cookieName = 'portfolio-test';
const sessions = new Map<string, MockSession>();

type MockSession = {
  owner: boolean;
  collections: ReturnType<typeof createFakeCollectionsApi>;
  photos: ReturnType<typeof createFakePhotosApi>;
};

async function handle(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname === '/__fixtures/health') return new Response('ready');

  if (frontend && request.method === 'GET' && !/^\/(api|auth|__fixtures|test-photo-uploads)(\/|$)/.test(pathname)) {
    const location = new URL(request.url);
    return fetch(new URL(location.pathname + location.search, frontend));
  }

  const cookie = request.headers.get('cookie')?.split('; ').find((value) => value.startsWith(cookieName + '='));
  const currentId = cookie?.slice(cookieName.length + 1);
  const session = currentId ? sessions.get(currentId) : undefined;

  if (request.method === 'POST' && pathname === '/__fixtures/collections') {
    const { owner, collections, itemsByCollection }: MockCollections = await request.json();
    const id = currentId ?? randomUUID();
    sessions.set(id, {
      owner,
      collections: createFakeCollectionsApi(collections, itemsByCollection),
      photos: session?.photos ?? createFakePhotosApi(),
    });
    return new Response(null, {
      status: 204,
      headers: { 'Set-Cookie': cookieName + '=' + id + '; Path=/; HttpOnly; SameSite=Lax' },
    });
  }

  if (!session) return new Response(null, { status: 401 });

  if (request.method === 'POST' && pathname === '/__fixtures/photos') {
    const { photos }: MockPhotos = await request.json();
    session.photos = createFakePhotosApi(...photos);
    return new Response(null, { status: 204 });
  }

  if (pathname === '/api/session' && request.method === 'GET') {
    return session.owner ? Response.json({ owner: true }) : new Response(null, { status: 401 });
  }

  if (pathname === '/auth/logout' && request.method === 'POST') {
    session.owner = false;
    return new Response(null, { status: 303, headers: { Location: '/' } });
  }

  if (isCollectionRequest(pathname)) {
    if (request.method !== 'GET' && !session.owner) return new Response(null, { status: 401 });
    return session.collections(request);
  }

  if (isPhotoRequest(pathname)) {
    if (!session.owner) return new Response(null, { status: 401 });
    return session.photos.handle(request);
  }

  return new Response(null, { status: 404 });
}

createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const response = await handle(new Request(new URL(incoming.url ?? '/', 'http://127.0.0.1'), {
      method: incoming.method,
      headers,
      body: chunks.length ? new Uint8Array(Buffer.concat(chunks)) : undefined,
    }));
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500);
    outgoing.end();
  }
}).listen(5196, '127.0.0.1');
