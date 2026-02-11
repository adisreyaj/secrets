import type { QueryClient, QueryKey } from '@tanstack/react-query'

export const invalidateQueryKeys = async (
  queryClient: QueryClient,
  ...keys: QueryKey[]
) => {
  await Promise.all(
    keys.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}
