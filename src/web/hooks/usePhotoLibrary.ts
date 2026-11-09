import { useEffect, useRef, useState } from 'react';
import { samplePhotos } from '../testutils/samplePhotos';

const pageSize = 24;

export default function usePhotoLibrary() {
  const [photos, setPhotos] = useState(samplePhotos);
  const [limit, setLimit] = useState(pageSize);
  const [uploadError, setUploadError] = useState(false);
  const nextPage = useRef<HTMLDivElement>(null);
  const uploads = useRef(new Map<string, string>());
  const hasMore = limit < photos.length;

  useEffect(() => {
    const end = nextPage.current;
    if (!end) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        observer.disconnect();
        setLimit((current) => current + pageSize);
      }
    });
    observer.observe(end);

    return () => observer.disconnect();
  }, [hasMore, limit]);

  useEffect(() => {
    const urls = uploads.current;

    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function upload(files: FileList) {
    const images = Array.from(files).filter((file) =>
      file.type.startsWith('image/'),
    );
    setUploadError(images.length !== files.length);

    const added = images.map((file) => {
      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      uploads.current.set(id, url);

      return { id, name: file.name, thumbnail: url, original: url };
    });

    setPhotos((current) => [...added, ...current]);
    setLimit((current) => current + added.length);
  }

  function remove(ids: ReadonlySet<string>) {
    for (const id of ids) {
      const url = uploads.current.get(id);
      if (url) URL.revokeObjectURL(url);
      uploads.current.delete(id);
    }

    setPhotos((current) => current.filter(({ id }) => !ids.has(id)));
  }

  return {
    photos: photos.slice(0, limit),
    hasMore,
    nextPage,
    upload,
    uploadError,
    remove,
  };
}
