export function formatUnreadBadgeCount(count: number): number | string {
  if (count <= 0) return 0;
  if (count < 10_000) return count;
  return `${Math.floor(count / 1_000)}k+`;
}
