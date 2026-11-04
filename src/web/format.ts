export function formatHours(h: number): string {
  if (h >= 1e9) return `${(h / 1e9).toFixed(1)} B h`;
  if (h >= 1e6) return `${(h / 1e6).toFixed(1)} M h`;
  if (h >= 1e3) return `${(h / 1e3).toFixed(1)} K h`;
  return `${h} h`;
}

export const formatDate = (ms: number | null): string =>
  ms == null ? "—" : new Date(ms).toISOString().slice(0, 10);
