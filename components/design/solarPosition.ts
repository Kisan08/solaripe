import { getPosition } from 'suncalc';

export function solarPositionAtIST(lat: number, lng: number, date: string, hour: number) {
  const [year, month, day] = date.split('-').map(Number);
  if (!Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 ||
      !Number.isFinite(hour) || hour < 0 || hour >= 24 || !year || !month || !day) throw new Error('Invalid solar inputs');
  const midnight = new Date(Date.UTC(year, month - 1, day));
  if (midnight.getUTCFullYear() !== year || midnight.getUTCMonth() !== month - 1 || midnight.getUTCDate() !== day) throw new Error('Invalid calendar date');
  const instant = new Date(midnight.getTime() + (Math.round(hour * 60) - 330) * 60000);
  const position = getPosition(instant, lat, lng);
  return { azimuth: position.azimuth, elevation: position.altitude };
}

// SunCalc 2 returns compass azimuth and altitude in degrees.
export function solarPositionIST(lat: number, lng: number, month: number, hour: number, year = 2026) {
  return solarPositionAtIST(lat, lng, `${year}-${String(month).padStart(2, '0')}-15`, hour);
}
