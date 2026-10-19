// PostgREST returnerar högst ett serverbestämt antal rader per anrop (normalt 1000) utan felmeddelande.
// Alla listor som kan växa hämtas därför sida för sida tills en sida är kortare än sidstorleken.
export const PAGE_SIZE = 1000;

export async function pageAll<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maxRows = 100000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows;
}
