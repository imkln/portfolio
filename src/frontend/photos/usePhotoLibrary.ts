import { useCallback, useEffect, useRef, useState } from 'react';
import type { Photo } from './Photo';
import {
  deletePhoto,
  listPhotos,
  uploadPhoto,
} from './photosApi';

const noFilters: readonly string[] = [];

export default function usePhotoLibrary(filters = noFilters, revision = 0) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pageToken, setPageToken] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const nextPage = useRef<HTMLDivElement>(null);
  const requests = useRef<AbortController | null>(null);
  const pageRequest = useRef<{ token: string; result: Promise<Photo[] | undefined> } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requests.current = controller;
    pageRequest.current = null;
    setLoading(true);
    setLoadError(false);
    setPhotos([]);
    setPageToken(undefined);
    const { signal } = controller;

    async function load() {
      try {
        const page = await listPhotos(signal, undefined, filters);
        if (signal.aborted) return;

        setPhotos(page.photos);
        setPageToken(page.nextPageToken);
      } catch {
        if (!signal.aborted) setLoadError(true);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [filters, revision]);

  const loadMore = useCallback(() => {
    const signal = requests.current?.signal;
    if (!signal || signal.aborted || !pageToken || loadError) return;
    if (pageRequest.current?.token === pageToken) return pageRequest.current.result;

    const result = listPhotos(signal, pageToken, filters).then(
      (page) => {
        if (signal.aborted) return;

        setPhotos((current) => [...current, ...page.photos]);
        setPageToken(page.nextPageToken);
        return page.photos;
      },
      () => {
        if (!signal.aborted) setLoadError(true);
        return undefined;
      },
    );
    pageRequest.current = { token: pageToken, result };
    return result;
  }, [filters, loadError, pageToken]);

  useEffect(() => {
    const end = nextPage.current;
    if (!end) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;

      observer.disconnect();
      void loadMore();
    });
    observer.observe(end);

    return () => observer.disconnect();
  }, [loadMore]);

  async function upload(files: FileList) {
    const signal = requests.current?.signal;
    if (!signal || signal.aborted || uploading) return;

    const selected = Array.from(files);
    const jpegs = selected.filter(
      (file) => file.type === 'image/jpeg' || (!file.type && /\.jpe?g$/i.test(file.name)),
    );
    setUploadError('');
    if (!jpegs.length) {
      setUploadError('Choose JPEG photos to upload.');
      return;
    }

    setUploading(true);
    let failed = selected.length - jpegs.length;

    for (const file of jpegs) {
      if (signal.aborted) return;
      try {
        await uploadPhoto(file, signal);
      } catch {
        failed++;
      }
    }
    if (signal.aborted) return;

    if (failed > 0) setUploadError('Some photos could not be uploaded.');
    setUploading(false);
  }

  async function remove(ids: ReadonlySet<string>) {
    const signal = requests.current?.signal;
    const failed = new Set(ids);
    if (!signal) return failed;

    for (const id of ids) {
      if (signal.aborted) break;
      try {
        await deletePhoto(id, signal);
        failed.delete(id);
        setPhotos((current) => current.filter((photo) => photo.id !== id));
      } catch {
        // Leave photos selected when the API could not delete them.
      }
    }
    return failed;
  }

  return {
    photos,
    hasMore: Boolean(pageToken) && !loadError,
    nextPage,
    loadMore,
    loading,
    loadError,
    upload,
    uploading,
    uploadError,
    remove,
  };
}
