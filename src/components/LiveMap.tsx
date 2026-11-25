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
  centerLat: number;
  centerLng: number;
  destLat?: number;
  destLng?: number;
  destName?: string;
  userLat?: number;
  userLng?: number;
  alertRadiusKm?: number;
  routeWaypoints?: StationPin[];
  isDeadReckoning?: boolean;
  isAlerting?: boolean;
  interactivePinMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  className?: string;
  zoom?: number;
}

const OPENFREEMAP_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';

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
  centerLat,
  centerLng,
  destLat,
  destLng,
  destName,
  userLat,
  userLng,
  alertRadiusKm = 2.0,
  routeWaypoints = [],
  isDeadReckoning = false,
  isAlerting = false,
  interactivePinMode = false,
  onMapClick,
  className = 'h-60 w-full',
  zoom = 11,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const lastFittedKeyRef = useRef<string>('');
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  const latestPropsRef = useRef({
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
    if (!map.isStyleLoaded()) return;
    const p = latestPropsRef.current;
    const accentColor = p.isAlerting ? '#ef4444' : p.isDeadReckoning ? '#f59e0b' : '#22d3ee';

    // Route Line + Stations GeoJSON
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

    // Alert Radius Circle GeoJSON
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
          'line-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'wakeme-route-points',
        type: 'circle',
        source: 'wakeme-route',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4,
          'circle-color': '#05070b',
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
          'line-opacity': 0.8,
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
      style: OPENFREEMAP_DARK_STYLE,
      center: [centerLng, centerLat],
      zoom,
      attributionControl: false,
    });

    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    map.on('style.load', () => {
      syncGeoJsonLayers(map);
    });

    map.on('error', () => {
      // Fallback empty dark vector style if offline before style loads
      if (!map.isStyleLoaded()) {
        try {
          map.setStyle({
            version: 8,
            sources: {},
            layers: [
              {
                id: 'offline-bg',
                type: 'background',
                paint: { 'background-color': '#070b14' },
              },
            ],
          });
        } catch {
          // Ignore
        }
      }
    });

    map.on('click', (e: MapMouseEvent) => {
      if (onClickRef.current) {
        onClickRef.current(e.lngLat.lat, e.lngLat.lng);
      }
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
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers & GeoJSON layers on prop updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    syncGeoJsonLayers(map);

    const destColor = isAlerting ? '#ef4444' : isDeadReckoning ? '#f59e0b' : '#22d3ee';
    if (typeof destLat === 'number' && typeof destLng === 'number') {
      if (!destMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${destColor};opacity:0.3;"></span>
          <span style="width:13px;height:13px;border-radius:9999px;background:${destColor};border:2.5px solid #05070b;box-shadow:0 0 14px ${destColor};"></span>
        </div>`;
        destMarkerRef.current = new Marker({ element: el })
          .setLngLat([destLng, destLat])
          .addTo(map);
      } else {
        destMarkerRef.current.setLngLat([destLng, destLat]);
        const dot = destMarkerRef.current.getElement().querySelectorAll('span');
        if (dot[0]) (dot[0] as HTMLElement).style.background = destColor;
        if (dot[1]) {
          (dot[1] as HTMLElement).style.background = destColor;
          (dot[1] as HTMLElement).style.boxShadow = `0 0 14px ${destColor}`;
        }
      }
    } else {
      destMarkerRef.current?.remove();
      destMarkerRef.current = null;
    }

    const userColor = isDeadReckoning ? '#f59e0b' : '#10b981';
    if (typeof userLat === 'number' && typeof userLng === 'number') {
      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.innerHTML = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:32px;height:32px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${userColor};opacity:0.32;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:${userColor};border:3px solid #ffffff;box-shadow:0 0 14px ${userColor};"></span>
        </div>`;
        userMarkerRef.current = new Marker({ element: el })
          .setLngLat([userLng, userLat])
          .addTo(map);
      } else {
        userMarkerRef.current.setLngLat([userLng, userLat]);
        const dot = userMarkerRef.current.getElement().querySelectorAll('span');
        if (dot[0]) (dot[0] as HTMLElement).style.background = userColor;
        if (dot[1]) {
          (dot[1] as HTMLElement).style.background = userColor;
          (dot[1] as HTMLElement).style.boxShadow = `0 0 14px ${userColor}`;
        }
      }
    } else {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
    }

    // Auto-fit route bounds once per journey or pan in pin-drop mode
    if (
      typeof userLat === 'number' &&
      typeof userLng === 'number' &&
      typeof destLat === 'number' &&
      typeof destLng === 'number'
    ) {
      const key = `${destLat.toFixed(4)},${destLng.toFixed(4)}:${routeWaypoints.length}`;
      if (lastFittedKeyRef.current !== key) {
        lastFittedKeyRef.current = key;
        const bounds = new LngLatBounds([userLng, userLat], [destLng, destLat]);
        routeWaypoints.forEach((w) => bounds.extend([w.lng, w.lat]));
        map.fitBounds(bounds, { padding: 42, maxZoom: 12, duration: 700 });
      }
    } else {
      lastFittedKeyRef.current = '';
      if (interactivePinMode && typeof destLat === 'number' && typeof destLng === 'number') {
        map.easeTo({ center: [destLng, destLat], duration: 400 });
      }
    }
  }, [
    destLat,
    destLng,
    destName,
    userLat,
    userLng,
    alertRadiusKm,
    routeWaypoints,
    isDeadReckoning,
    isAlerting,
    interactivePinMode,
  ]);

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

  const handleWestIndiaOverview = () => {
    mapRef.current?.easeTo({ center: [73.3, 19.05], zoom: 7.4, duration: 500 });
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#070b14] ${className}`}>
      {/* Fallback Radar Grid underneath WebGL canvas */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(34,211,238,0.16), transparent 60%), linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 28px 28px, 28px 28px',
        }}
      />

      <div ref={containerRef} className="relative z-10 h-full w-full" />

      {interactivePinMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full border border-cyan-400/30 bg-[#0b101c]/90 px-3 py-1 text-[11px] font-medium text-cyan-200 shadow-lg backdrop-blur">
          Tap anywhere on map to pin stop
        </div>
      )}

      <div className="absolute right-2.5 top-2.5 z-20 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleFitBounds}
          aria-label="Focus route on map"
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#0b101c]/90 text-slate-200 shadow-lg backdrop-blur hover:border-cyan-400/40 hover:text-cyan-300"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleWestIndiaOverview}
          aria-label="Corridor overview"
          className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-[#0b101c]/90 text-slate-200 shadow-lg backdrop-blur hover:border-cyan-400/40 hover:text-cyan-300"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
