import {
  CENTRAL_LINE_STATION_IDS,
  HARBOUR_LINE_STATION_IDS,
  MUMBAI_PRESET_ROUTES,
  MUMBAI_STATIONS,
  WESTERN_LINE_STATION_IDS,
  getStationById,
} from '../data/mumbaiLocal';
import { MumbaiStation, PollingZone, RouteWaypoint } from '../types/wakeme';

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

export function findNearestStation(
  lat: number,
  lng: number,
  maxKm = 6.0
): { station: MumbaiStation; distKm: number } | null {
  let best: { station: MumbaiStation; distKm: number } | null = null;
  for (const st of MUMBAI_STATIONS) {
    const d = haversineDistanceKm(lat, lng, st.lat, st.lng);
    if (d <= maxKm && (!best || d < best.distKm)) {
      best = { station: st, distKm: d };
    }
  }
  return best;
}

function attachCumulativeDistances(points: RouteWaypoint[]): RouteWaypoint[] {
  let acc = 0;
  return points.map((pt, idx) => {
    if (idx > 0) {
      acc += haversineDistanceKm(points[idx - 1].lat, points[idx - 1].lng, pt.lat, pt.lng);
    }
    return { ...pt, cumDistKm: Number(acc.toFixed(2)) };
  });
}

function findClosestCorridorIndex(
  stationIds: string[],
  lat: number,
  lng: number,
  maxKm: number
): { idx: number; distKm: number } | null {
  let best: { idx: number; distKm: number } | null = null;
  stationIds.forEach((id, idx) => {
    const st = getStationById(id);
    if (!st) return;
    const d = haversineDistanceKm(lat, lng, st.lat, st.lng);
    if (d <= maxKm && (!best || d < best.distKm)) {
      best = { idx, distKm: d };
    }
  });
  return best;
}

/**
 * Resolves ordered waypoints (Start -> intermediate stops -> Destination)
 * keeping ONLY stops strictly along the corridor between Origin and Destination.
 */
export function buildRouteWaypoints(params: {
  startLat: number;
  startLng: number;
  startName: string;
  destLat: number;
  destLng: number;
  destName: string;
  destLine?: string;
  presetRouteId?: string;
}): RouteWaypoint[] {
  const { startLat, startLng, startName, destLat, destLng, destName, destLine, presetRouteId } = params;
  const startNode: RouteWaypoint = { name: startName, lat: startLat, lng: startLng, line: destLine };
  const destNode: RouteWaypoint = { name: destName, lat: destLat, lng: destLng, line: destLine };

  const straightKm = haversineDistanceKm(startLat, startLng, destLat, destLng);
  if (straightKm < 0.35) {
    return attachCumulativeDistances([startNode, destNode]);
  }

  // 1. Explicit preset route handling
  if (presetRouteId) {
    const preset = MUMBAI_PRESET_ROUTES.find((r) => r.id === presetRouteId);
    if (preset && preset.stationIds.length >= 2) {
      const stations = preset.stationIds
        .map((id) => getStationById(id))
        .filter((s): s is MumbaiStation => Boolean(s));
      if (stations.length >= 2) {
        const mapped: RouteWaypoint[] = stations.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          line: s.line,
          lat: s.lat,
          lng: s.lng,
        }));
        const d0 = haversineDistanceKm(startLat, startLng, mapped[0].lat, mapped[0].lng);
        const dEnd = haversineDistanceKm(destLat, destLng, mapped[mapped.length - 1].lat, mapped[mapped.length - 1].lng);
        if (d0 <= 2.5 && dEnd <= 2.5) {
          return attachCumulativeDistances(mapped);
        }
      }
    }
  }

  // 2. Corridor matching (supports forward & reverse travel on Rail/Bus corridors)
  const localCorridors: string[][] = [
    CENTRAL_LINE_STATION_IDS,
    WESTERN_LINE_STATION_IDS,
    HARBOUR_LINE_STATION_IDS,
  ];
  const expressCorridors: string[][] = MUMBAI_PRESET_ROUTES.map((r) => r.stationIds);
  const isLocalPref = destLine === 'Central' || destLine === 'Western' || destLine === 'Harbour';
  const candidateCorridors = isLocalPref
    ? [...localCorridors, ...expressCorridors]
    : [...expressCorridors, ...localCorridors];

  const maxMatchKm = Math.min(8.5, Math.max(2.5, straightKm * 0.12));

  let bestCorridorSlice: RouteWaypoint[] | null = null;
  let bestScore = Infinity;

  for (const corridorIds of candidateCorridors) {
    const startHit = findClosestCorridorIndex(corridorIds, startLat, startLng, maxMatchKm);
    const endHit = findClosestCorridorIndex(corridorIds, destLat, destLng, maxMatchKm);
    if (!startHit || !endHit || startHit.idx === endHit.idx) continue;

    const step = startHit.idx < endHit.idx ? 1 : -1;
    const rawStations: MumbaiStation[] = [];
    for (let i = startHit.idx; i !== endHit.idx + step; i += step) {
      const st = getStationById(corridorIds[i]);
      if (st) rawStations.push(st);
    }
    if (rawStations.length < 2) continue;

    const score = startHit.distKm + endHit.distKm - rawStations.length * 0.05;
    if (score < bestScore) {
      bestScore = score;
      const midStops = rawStations.slice(1, -1).filter((st) => {
        const distS = haversineDistanceKm(startLat, startLng, st.lat, st.lng);
        const distE = haversineDistanceKm(destLat, destLng, st.lat, st.lng);
        return distS > 0.75 && distE > 0.75;
      });
      const firstSt = rawStations[0];
      const lastSt = rawStations[rawStations.length - 1];
      bestCorridorSlice = [
        {
          id: firstSt.id,
          name: startName,
          code: firstSt.code,
          line: firstSt.line,
          lat: startLat,
          lng: startLng,
        },
        ...midStops.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          line: s.line,
          lat: s.lat,
          lng: s.lng,
        })),
        {
          id: lastSt.id,
          name: destName,
          code: lastSt.code,
          line: lastSt.line,
          lat: destLat,
          lng: destLng,
        },
      ];
    }
  }

  if (bestCorridorSlice) {
    return attachCumulativeDistances(bestCorridorSlice);
  }

  // 3. Geometric corridor fallback for custom pairs across known hubs (when distance >= 12 km)
  if (straightKm >= 12) {
    const midLatRad = ((startLat + destLat) / 2) * (Math.PI / 180);
    const kx = 111.32 * Math.cos(midLatRad);
    const ky = 110.574;
    const ax = (destLng - startLng) * kx;
    const ay = (destLat - startLat) * ky;
    const lenSq = ax * ax + ay * ay;
    const maxPerpKm = Math.min(18, Math.max(3.5, straightKm * 0.12));
    const minSpacingKm = Math.max(2.5, straightKm * 0.06);

    const projected = MUMBAI_STATIONS.map((st) => {
      const px = (st.lng - startLng) * kx;
      const py = (st.lat - startLat) * ky;
      const t = lenSq > 0 ? (px * ax + py * ay) / lenSq : 0;
      const projX = t * ax;
      const projY = t * ay;
      const perpKm = Math.hypot(px - projX, py - projY);
      return { st, t, perpKm };
    })
      .filter((item) => {
        if (item.t < 0.06 || item.t > 0.94 || item.perpKm > maxPerpKm) return false;
        const dS = haversineDistanceKm(startLat, startLng, item.st.lat, item.st.lng);
        const dE = haversineDistanceKm(destLat, destLng, item.st.lat, item.st.lng);
        return dS > 1.5 && dE > 1.5;
      })
      .sort((a, b) => a.t - b.t);

    const deduped: MumbaiStation[] = [];
    for (const candidate of projected) {
      const tooClose = deduped.some(
        (prev) => haversineDistanceKm(prev.lat, prev.lng, candidate.st.lat, candidate.st.lng) < minSpacingKm
      );
      if (!tooClose) deduped.push(candidate.st);
    }

    if (deduped.length > 0) {
      return attachCumulativeDistances([
        startNode,
        ...deduped.slice(0, 12).map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          line: s.line,
          lat: s.lat,
          lng: s.lng,
        })),
        destNode,
      ]);
    }
  }

  return attachCumulativeDistances([startNode, destNode]);
}

export interface UpcomingStopItem {
  index: number;
  name: string;
  code?: string;
  lat: number;
  lng: number;
  distFromUserKm: number;
  isPassed: boolean;
  isNext: boolean;
  isDestination: boolean;
  insideAlertZone: boolean;
}

export interface RouteProgressSnapshot {
  progress0to1: number;
  coveredKm: number;
  totalRouteKm: number;
  routeRemainingKm: number;
  offRouteKm: number;
  currentSegmentIdx: number;
  nextStationName: string;
  remainingStopsCount: number;
  stops: UpcomingStopItem[];
}

export function computeRouteProgress(
  rawWaypoints: RouteWaypoint[],
  currentLat: number,
  currentLng: number,
  alertRadiusKm: number
): RouteProgressSnapshot {
  const waypoints = rawWaypoints.length >= 2 && typeof rawWaypoints[0].cumDistKm === 'number'
    ? rawWaypoints
    : attachCumulativeDistances(rawWaypoints);

  if (waypoints.length === 0) {
    return {
      progress0to1: 0,
      coveredKm: 0,
      totalRouteKm: 0,
      routeRemainingKm: 0,
      offRouteKm: 0,
      currentSegmentIdx: 0,
      nextStationName: 'Destination',
      remainingStopsCount: 0,
      stops: [],
    };
  }
  if (waypoints.length === 1) {
    const d = haversineDistanceKm(currentLat, currentLng, waypoints[0].lat, waypoints[0].lng);
    return {
      progress0to1: d < 0.2 ? 1 : 0,
      coveredKm: 0,
      totalRouteKm: d,
      routeRemainingKm: d,
      offRouteKm: 0,
      currentSegmentIdx: 0,
      nextStationName: waypoints[0].name,
      remainingStopsCount: 0,
      stops: [
        {
          index: 0,
          name: waypoints[0].name,
          code: waypoints[0].code,
          lat: waypoints[0].lat,
          lng: waypoints[0].lng,
          distFromUserKm: d,
          isPassed: false,
          isNext: true,
          isDestination: true,
          insideAlertZone: d <= alertRadiusKm,
        },
      ],
    };
  }

  const midLatRad = ((waypoints[0].lat + waypoints[waypoints.length - 1].lat) / 2) * (Math.PI / 180);
  const kx = 111.32 * Math.cos(midLatRad);
  const ky = 110.574;

  let bestSegIdx = 0;
  let bestLocalT = 0;
  let bestPerpKm = Infinity;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i];
    const b = waypoints[i + 1];
    const ax = (b.lng - a.lng) * kx;
    const ay = (b.lat - a.lat) * ky;
    const px = (currentLng - a.lng) * kx;
    const py = (currentLat - a.lat) * ky;
    const lenSq = ax * ax + ay * ay;
    const t = lenSq > 1e-6 ? Math.min(1, Math.max(0, (px * ax + py * ay) / lenSq)) : 0;
    const dx = px - t * ax;
    const dy = py - t * ay;
    const perpKm = Math.hypot(dx, dy);
    if (perpKm < bestPerpKm) {
      bestPerpKm = perpKm;
      bestSegIdx = i;
      bestLocalT = t;
    }
  }

  const totalRouteKm = Math.max(0.1, waypoints[waypoints.length - 1].cumDistKm || 0.1);
  const segStartCum = waypoints[bestSegIdx].cumDistKm || 0;
  const segEndCum = waypoints[bestSegIdx + 1].cumDistKm || segStartCum;
  const coveredKm = segStartCum + bestLocalT * (segEndCum - segStartCum);
  const progress0to1 = Math.min(1, Math.max(0, coveredKm / totalRouteKm));
  const routeRemainingKm = Math.max(0, totalRouteKm - coveredKm);

  const nextIdx =
    bestLocalT > 0.94 && bestSegIdx + 2 < waypoints.length
      ? bestSegIdx + 2
      : Math.min(waypoints.length - 1, bestSegIdx + 1);

  const stops: UpcomingStopItem[] = waypoints.map((wp, idx) => {
    const isPassed = idx < nextIdx;
    const isDestination = idx === waypoints.length - 1;
    const directDist = haversineDistanceKm(currentLat, currentLng, wp.lat, wp.lng);
    const polyDist =
      idx >= nextIdx
        ? Math.max(0, (wp.cumDistKm || 0) - coveredKm)
        : 0;
    const distFromUserKm = isPassed
      ? 0
      : bestPerpKm <= 10
      ? Math.max(directDist * 0.85, polyDist)
      : directDist;

    return {
      index: idx,
      name: wp.name,
      code: wp.code,
      lat: wp.lat,
      lng: wp.lng,
      distFromUserKm,
      isPassed,
      isNext: idx === nextIdx,
      isDestination,
      insideAlertZone: isDestination && distFromUserKm <= alertRadiusKm,
    };
  });

  const remainingIntermediate = stops.filter((s) => !s.isPassed && !s.isDestination).length;
  return {
    progress0to1,
    coveredKm,
    totalRouteKm,
    routeRemainingKm,
    offRouteKm: bestPerpKm,
    currentSegmentIdx: bestSegIdx,
    nextStationName: waypoints[nextIdx]?.name || waypoints[waypoints.length - 1].name,
    remainingStopsCount: remainingIntermediate,
    stops,
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
