// src/services/types.ts
export type Pagination = { cursor?: number | null; take?: number };
export type Page<T> = { items: T[]; nextCursor: number | null };
export const paginate = <T extends { id: number }>(
  items: T[],
  take: number
): Page<T> => {
  const limited = items.slice(0, take);
  const next = items.length > take ? items[take].id : null;
  return { items: limited, nextCursor: next };
};
