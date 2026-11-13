import { useEffect, useState } from 'react';
import { listTags, type Tag } from '../tagsApi';

export default function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagError, setTagError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    listTags(controller.signal).then(
      (items) => { if (!controller.signal.aborted) setTags(items); },
      () => { if (!controller.signal.aborted) setTagError(true); },
    );
    return () => controller.abort();
  }, []);

  return { tags, setTags, tagError };
}
