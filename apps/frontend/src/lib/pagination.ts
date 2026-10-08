/**
 * Split `items` into pages of `perPage`, snapping the final page to the end so
 * it is never left partly empty. When snapping, the last page overlaps the one
 * before it rather than leaving a gap.
 *
 * e.g. 7 items, perPage 3 => [0-2], [3-5], [4-6]
 *      9 items, perPage 3 => [0-2], [3-5], [6-8]
 */
export function buildPages<T>(items: T[], perPage: number): T[][] {
  if (items.length <= perPage) return items.length ? [items] : [];
  const pages: T[][] = [];
  let start = 0;
  while (start < items.length) {
    if (start + perPage > items.length) {
      const snapStart = Math.max(0, items.length - perPage);
      const last = pages[pages.length - 1];
      const snapSlice = items.slice(snapStart, snapStart + perPage);
      if (last && last.length === snapSlice.length && last[0] === snapSlice[0]) break;
      pages.push(snapSlice);
      break;
    }
    pages.push(items.slice(start, start + perPage));
    start += perPage;
  }
  return pages;
}
