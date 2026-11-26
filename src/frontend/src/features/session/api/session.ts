import { useQuery } from '@tanstack/react-query';

export function useOwnerSession() {
  return useQuery({
    queryKey: ['owner-session'],
    staleTime: Infinity,
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/session', { signal });
      if (response.status === 401) return false;
      if (!response.ok) throw new Error('Could not check session');
      return true;
    },
  });
}
