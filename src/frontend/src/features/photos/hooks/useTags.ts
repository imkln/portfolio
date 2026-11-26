import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listTags, type Tag } from '../api/tagsApi';

const tagsKey = ['tags'] as const;

export default function useTags() {
  const client = useQueryClient();
  const { data, isError: tagError } = useQuery({
    queryKey: tagsKey,
    queryFn: ({ signal }) => listTags(signal),
  });

  function setTags(update: (tags: Tag[]) => Tag[]) {
    client.setQueryData<Tag[]>(tagsKey, (tags) => update(tags ?? []));
  }

  return { tags: data ?? [], setTags, tagError };
}
