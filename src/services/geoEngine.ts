import { MUMBAI_STATIONS } from '../data/mumbaiLocal';
import { MumbaiStation, PollingZone } from '../types/wakeme';

const EARTH_RADIUS_KM = 6371.0;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function getPollingZoneInfo(distanceKm: number): {
  zone: PollingZone;
  intervalSec: number;
  label: string;
  powerSavingPct: number;
} {
  if (distanceKm > 15) {
    return {
      zone: 'ZONE_1_ECO',
      intervalSec: 60,
      label: 'Zone 1 • Eco (60s)',
      powerSavingPct: 88,
    };
  }
  if (distanceKm > 3) {
    return {
      zone: 'ZONE_2_BALANCED',
      intervalSec: 20,
      label: 'Zone 2 • Balanced (20s)',
      powerSavingPct: 62,
    };
  }
  return {
    zone: 'ZONE_3_HIGH',
    intervalSec: 3,
    label: 'Zone 3 • Precision (3s)',
    powerSavingPct: 15,
  };
}

/**
 * Computes Predictive Dead-Reckoning countdown (seconds until alert radius)
 * when network/GPS signal drops mid-journey.
 */
export function computeDeadReckoningEtaSec(
  lastDistanceKm: number,
  alertRadiusKm: number,
  avgSpeedKmh: number,
  remainingStopsCount: number,
  stopBufferMinPerStop: number
): number {
  const remainingToAlertKm = Math.max(0, lastDistanceKm - alertRadiusKm);
  if (remainingToAlertKm <= 0.05) {
    return 5;
  }
  const effectiveSpeedKmh = Math.max(avgSpeedKmh, 22); // Fallback transit baseline
  const travelSec = (remainingToAlertKm / effectiveSpeedKmh) * 3600;
  const stopsDelaySec = Math.max(0, remainingStopsCount) * stopBufferMinPerStop * 60;
  return Math.max(8, Math.round(travelSec + stopsDelaySec));
}

export function formatDurationCompact(totalSeconds: number | null): string {
  if (totalSeconds === null || !Number.isFinite(totalSeconds)) return '--';
  const sec = Math.max(0, Math.round(totalSeconds));
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${String(remSec).padStart(2, '0')}s`;
  return `${remSec}s`;
}

export interface RoutePositionResult {
  lat: number;
  lng: number;
  nextStationName: string | null;
  remainingStopsCount: number;
}

/**
 * Interpolates a smooth position along a sequence of stations or 2 endpoints.
 */
export function interpolateStations(
  waypoints: Array<{ name: string; lat: number; lng: number }>,
  progress0to1: number
): RoutePositionResult {
  if (waypoints.length === 0) {
    return { lat: 19.0185, lng: 72.8435, nextStationName: null, remainingStopsCount: 0 };
  }
  if (waypoints.length === 1) {
    return {
      lat: waypoints[0].lat,
      lng: waypoints[0].lng,
      nextStationName: waypoints[0].name,
      remainingStopsCount: 0,
    };
  }

  const p = Math.min(1, Math.max(0, progress0to1));
  const segLengths: number[] = [];
  let totalDist = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const d = haversineDistanceKm(
      waypoints[i].lat,
      waypoints[i].lng,
      waypoints[i + 1].lat,
      waypoints[i + 1].lng
    );
    segLengths.push(Math.max(0.05, d));
    totalDist += Math.max(0.05, d);
  }

  const targetDist = p * totalDist;
  let acc = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const segLen = segLengths[i];
    if (acc + segLen >= targetDist || i === segLengths.length - 1) {
      const localT = Math.min(1, Math.max(0, (targetDist - acc) / segLen));
      const a = waypoints[i];
      const b = waypoints[i + 1];
      return {
        lat: a.lat + (b.lat - a.lat) * localT,
        lng: a.lng + (b.lng - a.lng) * localT,
        nextStationName: b.name,
        remainingStopsCount: Math.max(0, waypoints.length - 1 - (i + 1)),
      };
    }
    acc += segLen;
  }

  const last = waypoints[waypoints.length - 1];
  return {
    lat: last.lat,
    lng: last.lng,
    nextStationName: last.name,
    remainingStopsCount: 0,
  };
}

export interface SearchPlaceResult {
  id: string;
  name: string;
  subtitle: string;
  lat: number;
  lng: number;
  source: 'Offline Junction DB' | 'OpenStreetMap';
  line?: MumbaiStation['line'];
}

export async function searchPlacesHybrid(query: string): Promise<SearchPlaceResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // 1. Instant offline station & city lookup (Long-Distance + Mumbai Local)
  const localMatches: SearchPlaceResult[] = MUMBAI_STATIONS.filter(
    (st) =>
      st.name.toLowerCase().includes(q) ||
      st.code.toLowerCase().includes(q) ||
      st.line.toLowerCase().includes(q)
  )
    .slice(0, 8)
    .map((st) => ({
      id: st.id,
      name: st.name,
      subtitle: `${st.line} (${st.code}) · Offline Ready`,
      lat: st.lat,
      lng: st.lng,
      source: 'Offline Junction DB',
      line: st.line,
    }));

  if (!navigator.onLine || q.length < 3) {
    return localMatches;
  }

  // 2. Non-blocking Photon OSM lookup (pan-India search, biased around West India)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      query
    )}&lat=19.076&lon=72.8777&limit=6`;

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return localMatches;

    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          osm_id?: number;
          name?: string;
          city?: string;
          state?: string;
          street?: string;
        };
      }>;
    };

    const remoteMatches: SearchPlaceResult[] = (data.features || [])
      .filter((f) => f.geometry?.coordinates && f.properties?.name)
      .map((f, idx) => {
        const [lng, lat] = f.geometry!.coordinates!;
        const props = f.properties!;
        const sub = [props.street, props.city || 'Mumbai', props.state]
          .filter(Boolean)
          .join(', ');
        return {
          id: `osm-${props.osm_id || idx}-${lat.toFixed(4)}`,
          name: props.name!,
          subtitle: sub || 'OpenStreetMap Location',
          lat,
          lng,
          source: 'OpenStreetMap',
        };
      });

    // Deduplicate by close proximity/name
    const merged = [...localMatches];
    for (const r of remoteMatches) {
      const exists = merged.some(
        (m) =>
          m.name.toLowerCase() === r.name.toLowerCase() ||
          haversineDistanceKm(m.lat, m.lng, r.lat, r.lng) < 0.15
      );
      if (!exists) merged.push(r);
    }
    return merged.slice(0, 10);
  } catch {
    return localMatches;
  }
}

export interface ReverseGeocodeResult {
  name: string;
  subtitle: string;
}

export async function reverseGeocodeHybrid(lat: number, lng: number): Promise<ReverseGeocodeResult> {
  // Check nearest known transit station within 1.5 km first as fast local anchor
  let closestStation: { name: string; line: string; distKm: number } | null = null;
  for (const st of MUMBAI_STATIONS) {
    const d = haversineDistanceKm(lat, lng, st.lat, st.lng);
    if (d <= 1.5 && (!closestStation || d < closestStation.distKm)) {
      closestStation = { name: st.name, line: st.line, distKm: d };
    }
  }

  if (!navigator.onLine) {
    if (closestStation) {
      return {
        name: closestStation.name,
        subtitle: `Near ${closestStation.line} (${closestStation.distKm.toFixed(1)} km)`,
      };
    }
    return {
      name: 'Pinned Location',
      subtitle: `${lat.toFixed(4)}°, ${lng.toFixed(4)}° · Offline Pin`,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(
      `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}`,
      { signal: controller.signal }
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as {
        features?: Array<{
          properties?: {
            name?: string;
            street?: string;
            district?: string;
            locality?: string;
            city?: string;
            state?: string;
          };
        }>;
      };
      const props = data.features?.[0]?.properties;
      if (props) {
        const primary = props.name || props.street || props.locality || props.district || props.city;
        const secondary = [props.district || props.locality, props.city, props.state]
          .filter((v, idx, arr) => Boolean(v) && v !== primary && arr.indexOf(v) === idx)
          .join(', ');
        if (primary) {
          return {
            name: primary,
            subtitle: secondary || 'Selected map location',
          };
        }
      }
    }
  } catch {
    // Fall back gracefully
  }

  if (closestStation) {
    return {
      name: closestStation.name,
      subtitle: `Near ${closestStation.line} (${closestStation.distKm.toFixed(1)} km)`,
    };
  }
  return {
    name: 'Pinned Location',
    subtitle: `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`,
  };
}
