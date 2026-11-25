import React, { useEffect, useRef } from 'react';
import {
  AttributionControl,
  GeoJSONSource,
  LngLatBounds,
  Map as MapLibreMap,
  MapMouseEvent,
  Marker,
  setWorkerUrl,
} from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Crosshair, Maximize2 } from 'lucide-react';

setWorkerUrl(workerUrl);

type GeoFeature =
  | {
      type: 'Feature';
      properties: Record<string, unknown>;
      geometry: { type: 'LineString'; coordinates: number[][] };
    }
  | {
      type: 'Feature';
      properties: Record<string, unknown>;
      geometry: { type: 'Point'; coordinates: number[] };
    }
  | {
      type: 'Feature';
      properties: Record<string, unknown>;
      geometry: { type: 'Polygon'; coordinates: number[][][] };
    };

interface GeoCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

interface StationPin {
  name: string;
  lat: number;
  lng: number;
}

interface LiveMapProps {
  theme: 'light' | 'dark';
  centerLat: number;
  centerLng: number;
  destLat?: number;
  destLng?: number;
  destName?: string;
  userLat?: number;
  userLng?: number;
  estimatedLat?: number | null;
  estimatedLng?: number | null;
  alertRadiusKm?: number;
  routeWaypoints?: StationPin[];
  isDeadReckoning?: boolean;
  isAlerting?: boolean;
  interactivePinMode?: boolean;
  centerCrosshairMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onMapMoveStart?: () => void;
  onMapMoveEnd?: (lat: number, lng: number) => void;
  className?: string;
  zoom?: number;
}

function getStyleUrl(theme: 'light' | 'dark'): string {
  return theme === 'dark'
    ? 'https://tiles.openfreemap.org/styles/dark'
    : 'https://tiles.openfreemap.org/styles/liberty';
}

function createCirclePolygon(lng: number, lat: number, radiusKm: number, points = 64): number[][] {
  const coords: number[][] = [];
  const distanceX = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;

  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([lng + distanceX * Math.cos(theta), lat + distanceY * Math.sin(theta)]);
  }
  return coords;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  theme,
  centerLat,
  centerLng,
  destLat,
  destLng,
  destName,
  userLat,
  userLng,
  estimatedLat = null,
  estimatedLng = null,
  alertRadiusKm = 2.0,
  routeWaypoints = [],
  isDeadReckoning = false,
  isAlerting = false,
  interactivePinMode = false,
  centerCrosshairMode = false,
  onMapClick,
  onMapMoveStart,
  onMapMoveEnd,
  className = 'h-56 w-full',
  zoom = 11,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const estMarkerRef = useRef<Marker | null>(null);
  const lastFittedKeyRef = useRef<string>('');
  const appliedThemeRef = useRef<'light' | 'dark'>(theme);
  const styleReadyRef = useRef(false);
  const loadedOnceRef = useRef(false);
  const centerCrosshairRef = useRef(centerCrosshairMode);
  centerCrosshairRef.current = centerCrosshairMode;
  const onClickRef = useRef(onMapClick);
  const onMoveStartRef = useRef(onMapMoveStart);
  const onMoveEndRef = useRef(onMapMoveEnd);
  onClickRef.current = onMapClick;
  onMoveStartRef.current = onMapMoveStart;
  onMoveEndRef.current = onMapMoveEnd;

  const latestPropsRef = useRef({
    theme,
    destLat,
    destLng,
    destName,
    userLat,
    userLng,
    alertRadiusKm,
    routeWaypoints,
    isDeadReckoning,
    isAlerting,
  });
  latestPropsRef.current = {
    theme,
    destLat,
    destLng,
    destName,
    userLat,
    userLng,
    alertRadiusKm,
    routeWaypoints,
    isDeadReckoning,
    isAlerting,
  };

  const syncGeoJsonLayers = (map: MapLibreMap) => {
    if (!styleReadyRef.current && !map.getStyle()?.layers) return;
    const p = latestPropsRef.current;
    const accentColor = p.isAlerting
      ? '#dc2626'
      : p.isDeadReckoning
      ? '#d97706'
      : p.theme === 'dark'
      ? '#3b82f6'
      : '#2563eb';

    const routeFeature: GeoCollection = {
      type: 'FeatureCollection',
      features:
        p.routeWaypoints.length >= 2
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'LineString',
                  coordinates: p.routeWaypoints.map((w) => [w.lng, w.lat]),
                },
              },
              ...p.routeWaypoints.map((w) => ({
                type: 'Feature' as const,
                properties: { name: w.name },
                geometry: {
                  type: 'Point' as const,
                  coordinates: [w.lng, w.lat],
                },
              })),
            ]
          : [],
    };

    const circleFeature: GeoCollection = {
      type: 'FeatureCollection',
      features:
        typeof p.destLat === 'number' && typeof p.destLng === 'number'
          ? [
              {
                type: 'Feature',
                properties: {},
                geometry: {
                  type: 'Polygon',
                  coordinates: [createCirclePolygon(p.destLng, p.destLat, Math.max(0.15, p.alertRadiusKm))],
                },
              },
            ]
          : [],
    };

    const routeSrc = map.getSource('wakeme-route') as GeoJSONSource | undefined;
    if (routeSrc) {
      routeSrc.setData(routeFeature as unknown as Parameters<GeoJSONSource['setData']>[0]);
    } else {
      map.addSource('wakeme-route', {
        type: 'geojson',
        data: routeFeature as unknown as Parameters<GeoJSONSource['setData']>[0],
      });
      map.addLayer({
        id: 'wakeme-route-line',
        type: 'line',
        source: 'wakeme-route',
        filter: ['==', '$type', 'LineString'],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': accentColor,
          'line-width': 3.5,
          'line-opacity': 0.9,
        },
      });
      map.addLayer({
        id: 'wakeme-route-points',
        type: 'circle',
        source: 'wakeme-route',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': p.theme === 'dark' ? '#0a0d12' : '#ffffff',
          'circle-stroke-width': 2,
          'circle-stroke-color': accentColor,
        },
      });
    }

    if (map.getLayer('wakeme-route-line')) {
      map.setPaintProperty('wakeme-route-line', 'line-color', accentColor);
    }
    if (map.getLayer('wakeme-route-points')) {
      map.setPaintProperty('wakeme-route-points', 'circle-stroke-color', accentColor);
    }

    const circleSrc = map.getSource('wakeme-circle') as GeoJSONSource | undefined;
    if (circleSrc) {
      circleSrc.setData(circleFeature as unknown as Parameters<GeoJSONSource['setData']>[0]);
    } else {
      map.addSource('wakeme-circle', {
        type: 'geojson',
        data: circleFeature as unknown as Parameters<GeoJSONSource['setData']>[0],
      });
      map.addLayer({
        id: 'wakeme-circle-fill',
        type: 'fill',
        source: 'wakeme-circle',
        paint: {
          'fill-color': accentColor,
          'fill-opacity': 0.14,
        },
      });
      map.addLayer({
        id: 'wakeme-circle-outline',
        type: 'line',
        source: 'wakeme-circle',
        paint: {
          'line-color': accentColor,
          'line-width': 2,
          'line-opacity': 0.85,
        },
      });
    }

    if (map.getLayer('wakeme-circle-fill')) {
      map.setPaintProperty('wakeme-circle-fill', 'fill-color', accentColor);
      map.setPaintProperty('wakeme-circle-fill', 'fill-opacity', p.isAlerting ? 0.24 : 0.14);
    }
    if (map.getLayer('wakeme-circle-outline')) {
      map.setPaintProperty('wakeme-circle-outline', 'line-color', accentColor);
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: getStyleUrl(theme),
      center: [centerLng, centerLat],
      zoom,
      cooperativeGestures: !interactivePinMode,
      attributionControl: false,
    });

    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    map.on('style.load', () => {
      styleReadyRef.current = true;
      loadedOnceRef.current = true;
      syncGeoJsonLayers(map);
    });

    map.on('error', () => {
      if (!styleReadyRef.current && !loadedOnceRef.current) {
        try {
          styleReadyRef.current = false;
          map.setStyle({
            version: 8,
            sources: {},
            layers: [
              {
                id: 'offline-bg',
                type: 'background',
                paint: {
                  'background-color': latestPropsRef.current.theme === 'dark' ? '#0a0d12' : '#edf1f7',
                },
              },
            ],
          });
        } catch {
          // Ignore
        }
      }
    });

    map.on('click', (e: MapMouseEvent) => {
      if (centerCrosshairRef.current) {
        map.easeTo({ center: [e.lngLat.lng, e.lngLat.lat], duration: 350 });
      }
      if (onClickRef.current) {
        onClickRef.current(e.lngLat.lat, e.lngLat.lng);
      }
    });

    map.on('movestart', () => {
      if (onMoveStartRef.current) onMoveStartRef.current();
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      if (onMoveEndRef.current) onMoveEndRef.current(c.lat, c.lng);
    });

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(containerRef.current);

    mapRef.current = map;

    return () => {
      observer.disconnect();
      destMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      estMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch map style smoothly when Light/Dark theme toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedThemeRef.current === theme) return;
    appliedThemeRef.current = theme;
    styleReadyRef.current = false;
    map.setStyle(getStyleUrl(theme));
  }, [theme]);

  // Update markers & GeoJSON layers on prop updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    syncGeoJsonLayers(map);

    const destColor = isAlerting
      ? '#dc2626'
      : isDeadReckoning
      ? '#d97706'
      : theme === 'dark'
      ? '#3b82f6'
      : '#2563eb';

    if (!centerCrosshairMode && typeof destLat === 'number' && typeof destLng === 'number') {
      if (!destMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${destColor};opacity:0.25;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:${destColor};border:2.5px solid #ffffff;box-shadow:0 2px 10px rgba(0,0,0,0.35);"></span>
        </div>`;
        destMarkerRef.current = new Marker({ element: el })
          .setLngLat([destLng, destLat])
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat([destLng, destLat]);
        const dot = destMarkerRef.current.getElement().querySelectorAll('span');
        if (dot[0]) (dot[0] as HTMLElement).style.background = destColor;
        if (dot[1]) (dot[1] as HTMLElement).style.background = destColor;
      }
    } else {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
    }

    const userColor = isDeadReckoning ? '#64748b' : '#059669';
    if (typeof userLat === 'number' && typeof userLng === 'number') {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${userColor};opacity:0.28;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:${userColor};border:3px solid #ffffff;box-shadow:0 2px 10px rgba(0,0,0,0.35);"></span>
        </div>`;
        userMarkerRef.current = new Marker({ element: el })
          .setLngLat([userLng, userLat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userLng, userLat]);
        const dot = userMarkerRef.current.getElement().querySelectorAll('span');
        if (dot[0]) (dot[0] as HTMLElement).style.background = userColor;
        if (dot[1]) (dot[1] as HTMLElement).style.background = userColor;
      }
    } else {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    }

    if (
      isDeadReckoning &&
      typeof estimatedLat === 'number' &&
      typeof estimatedLng === 'number'
    ) {
      if (!estMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:#f59e0b;opacity:0.30;border:2px dashed #f59e0b;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:#d97706;border:2.5px solid #ffffff;box-shadow:0 2px 10px rgba(217,119,6,0.5);"></span>
        </div>`;
        estMarkerRef.current = new Marker({ element: el })
          .setLngLat([estimatedLng, estimatedLat])
          .addTo(map);
      } else {
        estMarkerRef.current.setLngLat([estimatedLng, estimatedLat]);
      }
    } else {
      estMarkerRef.current?.remove();
      estMarkerRef.current = null;
    }

    if (
      typeof userLat === 'number' &&
      typeof userLng === 'number' &&
      typeof destLat === 'number' &&
      typeof destLng === 'number'
    ) {
      const wpFirst = routeWaypoints[0];
      const wpLast = routeWaypoints[routeWaypoints.length - 1];
      const key = `${destLat.toFixed(4)},${destLng.toFixed(4)}:${routeWaypoints.length}:${wpFirst?.name || ''}:${wpLast?.name || ''}:${wpFirst?.lat.toFixed(3) || ''}`;
      if (lastFittedKeyRef.current !== key) {
        lastFittedKeyRef.current = key;
        const bounds = new LngLatBounds([userLng, userLat], [destLng, destLat]);
        routeWaypoints.forEach((w) => bounds.extend([w.lng, w.lat]));
        map.fitBounds(bounds, { padding: 42, maxZoom: 12.5, duration: 600 });
      }
    } else {
      lastFittedKeyRef.current = '';
      if (interactivePinMode && !centerCrosshairMode && typeof destLat === 'number' && typeof destLng === 'number') {
        map.easeTo({ center: [destLng, destLat], duration: 400 });
      }
    }
  }, [
    theme,
    destLat,
    destLng,
    destName,
    userLat,
    userLng,
    estimatedLat,
    estimatedLng,
    alertRadiusKm,
    routeWaypoints,
    isDeadReckoning,
    isAlerting,
    interactivePinMode,
    centerCrosshairMode,
  ]);

  // Recenter smoothly when external centerLat/centerLng changes in centerCrosshairMode
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !centerCrosshairMode) return;
    const current = map.getCenter();
    const movedFar = Math.abs(current.lat - centerLat) > 0.002 || Math.abs(current.lng - centerLng) > 0.002;
    if (movedFar) {
      map.easeTo({ center: [centerLng, centerLat], zoom: Math.max(map.getZoom(), 12.5), duration: 450 });
    }
  }, [centerLat, centerLng, centerCrosshairMode]);

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    if (
      typeof userLat === 'number' &&
      typeof userLng === 'number' &&
      typeof destLat === 'number' &&
      typeof destLng === 'number'
    ) {
      const bounds = new LngLatBounds([userLng, userLat], [destLng, destLat]);
      routeWaypoints.forEach((w) => bounds.extend([w.lng, w.lat]));
      map.fitBounds(bounds, { padding: 42, maxZoom: 13, duration: 500 });
    } else if (typeof destLat === 'number' && typeof destLng === 'number') {
      map.easeTo({ center: [destLng, destLat], zoom: 12, duration: 500 });
    } else {
      map.easeTo({ center: [centerLng, centerLat], zoom, duration: 500 });
    }
  };

  const handleOverview = () => {
    mapRef.current?.easeTo({ center: [73.3, 19.05], zoom: 7.4, duration: 500 });
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-[#edf1f7] dark:border-white/[0.08] dark:bg-[#141923] ${className}`}>
      <div ref={containerRef} className="relative z-10 h-full w-full" />

      {interactivePinMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full border border-slate-200 bg-white/92 px-3 py-1 text-[11px] font-semibold text-slate-800 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#141923]/90 dark:text-slate-100">
          {centerCrosshairMode ? 'Drag map to position pin' : 'Tap map to move pin'}
        </div>
      )}

      <div className="absolute right-2.5 top-2.5 z-20 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleFitBounds}
          aria-label="Focus route on map"
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/92 text-slate-700 shadow-sm backdrop-blur hover:text-blue-600 dark:border-white/10 dark:bg-[#141923]/90 dark:text-slate-200 dark:hover:text-blue-400"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleOverview}
          aria-label="Corridor overview"
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/92 text-slate-700 shadow-sm backdrop-blur hover:text-blue-600 dark:border-white/10 dark:bg-[#141923]/90 dark:text-slate-200 dark:hover:text-blue-400"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
