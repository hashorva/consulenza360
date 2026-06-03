export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  afterBatch?: (results: R[]) => boolean,
): Promise<R[]> {
  const allResults: R[] = [];

  for (let start = 0; start < items.length; start += concurrency) {
    const slice = items.slice(start, start + concurrency);
    const batch = await Promise.all(slice.map((item, offset) => mapper(item, start + offset)));
    allResults.push(...batch);

    if (afterBatch?.(allResults) === false) {
      break;
    }
  }

  return allResults;
}

