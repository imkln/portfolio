import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Photo } from '../types/Photo';
import { deletePhoto, photoLibraryQuery, uploadPhoto } from '../api/photosApi';

const noFilters: readonly string[] = [];

export default function usePhotoLibrary(filters = noFilters, revision = 0) {
  const client = useQueryClient();
  const query = useInfiniteQuery(photoLibraryQuery(filters, revision));
  const photos = query.data?.pages.flatMap((page) => page.photos) ?? [];
  const pageToken = query.data?.pages.at(-1)?.nextPageToken;
  const { fetchNextPage, isError: loadError, isPending: loading } = query;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const nextPage = useRef<HTMLDivElement>(null);
  const mutations = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    mutations.current = controller;
    return () => controller.abort();
  }, []);

  const loadMore = useCallback(() => {
    if (!pageToken || loadError) return;

    return fetchNextPage({ cancelRefetch: false }).then((result) =>
      result.isError ? undefined : result.data?.pages.at(-1)?.photos,
    );
  }, [fetchNextPage, loadError, pageToken]);

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
    const signal = mutations.current?.signal;
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
    const signal = mutations.current?.signal;
    const failed = new Set(ids);
    if (!signal || signal.aborted) return failed;

    for (const id of ids) {
      if (signal.aborted) break;
      try {
        await deletePhoto(id, signal);
        failed.delete(id);
        client.setQueriesData<InfiniteData<{ photos: Photo[]; nextPageToken?: string }>>(
          { queryKey: ['photos'] },
          (current) =>
            current && {
              ...current,
              pages: current.pages.map((page) => ({
                ...page,
                photos: page.photos.filter((photo) => photo.id !== id),
              })),
            },
        );
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
