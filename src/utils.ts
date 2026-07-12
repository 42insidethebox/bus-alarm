export function timeToMinutes(time: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error(`Invalid time: ${time}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function parseTimes(input: string) {
  const matches = input.match(/(?:[01]?\d|2[0-3])[:.]?[0-5]\d/g) ?? [];
  const normalized = matches.map((raw) => {
    const clean = raw.replace('.', ':');
    if (clean.includes(':')) {
      const [h, m] = clean.split(':');
      return `${h.padStart(2, '0')}:${m}`;
    }
    return `${clean.slice(0, -2).padStart(2, '0')}:${clean.slice(-2)}`;
  });
  return [...new Set(normalized)].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const id = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const formatLocalDate=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number) {
  const r = 6371e3, p1 = aLat * Math.PI / 180, p2 = bLat * Math.PI / 180;
  const dp = (bLat - aLat) * Math.PI / 180, dl = (bLon - aLon) * Math.PI / 180;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
