import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Crosshair, Layers } from 'lucide-react';
import { MUMBAI_PRESET_ROUTES, getStationById } from '../data/mumbaiLocal';
import { Destination } from '../types/wakeme';

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
  savedDestinations?: Destination[];
  showMumbaiNetwork?: boolean;
  isDeadReckoning?: boolean;
  isAlerting?: boolean;
  interactivePinMode?: boolean;
  onMapClick?: (lat: number, lng: number) => void;
  onSelectDestinationPin?: (dest: Destination) => void;
  className?: string;
  zoom?: number;
}

const LINE_COLORS: Record<string, string> = {
  Western: '#38bdf8',
  Central: '#f59e0b',
  Harbour: '#10b981',
};

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
  savedDestinations = [],
  showMumbaiNetwork = false,
  isDeadReckoning = false,
  isAlerting = false,
  interactivePinMode = false,
  onMapClick,
  onSelectDestinationPin,
  className = 'h-full w-full',
  zoom = 11,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const lastFittedRouteRef = useRef<string>('');
  const onClickRef = useRef(onMapClick);
  const onSelectPinRef = useRef(onSelectDestinationPin);
  onClickRef.current = onMapClick;
  onSelectPinRef.current = onSelectDestinationPin;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom,
      zoomControl: false,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapRef.current = map;
    layerGroupRef.current = group;

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (onClickRef.current) {
        onClickRef.current(e.latlng.lat, e.latlng.lng);
      }
    });

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Optional Mumbai Rail Network Background Lines (Home / Overview)
    if (showMumbaiNetwork) {
      MUMBAI_PRESET_ROUTES.forEach((route) => {
        const pts: L.LatLngExpression[] = [];
        route.stationIds.forEach((id) => {
          const st = getStationById(id);
          if (st) pts.push([st.lat, st.lng]);
        });
        if (pts.length >= 2) {
          const color = LINE_COLORS[route.line] || '#22d3ee';
          L.polyline(pts, {
            color,
            weight: 3,
            opacity: 0.45,
          }).addTo(group);

          pts.forEach((pt, idx) => {
            const st = getStationById(route.stationIds[idx]);
            if (!st) return;
            L.circleMarker(pt, {
              radius: st.isMajor ? 4 : 2.5,
              color,
              fillColor: '#05070b',
              fillOpacity: 1,
              weight: 1.5,
            })
              .bindTooltip(`${st.name} (${st.code})`, { direction: 'top' })
              .addTo(group);
          });
        }
      });

      // Saved Destinations on Overview Map
      savedDestinations.forEach((dest) => {
        const isFocused =
          typeof destLat === 'number' &&
          typeof destLng === 'number' &&
          Math.abs(dest.latitude - destLat) < 0.0005 &&
          Math.abs(dest.longitude - destLng) < 0.0005;
        if (isFocused) return;

        const pinColor = LINE_COLORS[dest.line] || '#22d3ee';
        const marker = L.circleMarker([dest.latitude, dest.longitude], {
          radius: 6,
          color: '#ffffff',
          fillColor: pinColor,
          fillOpacity: 0.95,
          weight: 2,
        })
          .bindTooltip(dest.destination_name, { direction: 'top' })
          .addTo(group);

        marker.on('click', () => {
          if (onSelectPinRef.current) onSelectPinRef.current(dest);
        });
      });
    }

    // 2. Active Route Polyline & Waypoint Stations
    if (routeWaypoints.length >= 2) {
      const latLngs: L.LatLngExpression[] = routeWaypoints.map((w) => [w.lat, w.lng]);
      L.polyline(latLngs, {
        color: isDeadReckoning ? '#f59e0b' : '#22d3ee',
        weight: 4,
        opacity: 0.85,
        dashArray: isDeadReckoning ? '6 8' : undefined,
      }).addTo(group);

      routeWaypoints.forEach((wp, idx) => {
        if (idx === routeWaypoints.length - 1) return;
        L.circleMarker([wp.lat, wp.lng], {
          radius: 4.5,
          color: isDeadReckoning ? '#f59e0b' : '#38bdf8',
          fillColor: '#05070b',
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip(wp.name, { direction: 'top' })
          .addTo(group);
      });
    }

    // 3. Target Destination Pin + Approach Radius Ring
    if (typeof destLat === 'number' && typeof destLng === 'number') {
      const circleColor = isAlerting ? '#ef4444' : isDeadReckoning ? '#f59e0b' : '#22d3ee';
      L.circle([destLat, destLng], {
        radius: Math.max(120, alertRadiusKm * 1000),
        color: circleColor,
        weight: 2,
        fillColor: circleColor,
        fillOpacity: isAlerting ? 0.24 : 0.13,
        dashArray: isDeadReckoning ? '6 6' : undefined,
      }).addTo(group);

      const destIcon = L.divIcon({
        className: 'wakeme-dest-icon',
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${circleColor};opacity:0.28;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:${circleColor};border:2.5px solid #05070b;box-shadow:0 0 14px ${circleColor};"></span>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([destLat, destLng], { icon: destIcon }).addTo(group);
      if (destName) {
        marker.bindTooltip(`${destName} • ${alertRadiusKm.toFixed(1)} km alert`, {
          direction: 'top',
          offset: [0, -12],
        });
      }
    }

    // 4. Live User / Train Position Marker
    if (typeof userLat === 'number' && typeof userLng === 'number') {
      const userColor = isDeadReckoning ? '#f59e0b' : '#10b981';
      const userIcon = L.divIcon({
        className: 'wakeme-user-icon',
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:34px;height:34px;">
          <span style="position:absolute;width:30px;height:30px;border-radius:9999px;background:${userColor};opacity:0.32;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:${userColor};border:3px solid #ffffff;box-shadow:0 0 14px ${userColor};"></span>
        </div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      L.marker([userLat, userLng], { icon: userIcon })
        .bindTooltip(isDeadReckoning ? 'Estimated Train Position' : 'Current Location', {
          direction: 'top',
        })
        .addTo(group);
    }
  }, [
    destLat,
    destLng,
    destName,
    userLat,
    userLng,
    alertRadiusKm,
    routeWaypoints,
    savedDestinations,
    showMumbaiNetwork,
    isDeadReckoning,
    isAlerting,
  ]);

  // Smooth pan/fit when previewing a destination, dropping a pin, or starting a journey
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (typeof userLat === 'number' && typeof userLng === 'number' && typeof destLat === 'number' && typeof destLng === 'number') {
      const routeKey = `${destLat.toFixed(4)},${destLng.toFixed(4)}:${routeWaypoints.length}`;
      if (lastFittedRouteRef.current !== routeKey) {
        lastFittedRouteRef.current = routeKey;
        const pts: L.LatLngExpression[] = [[userLat, userLng], [destLat, destLng]];
        routeWaypoints.forEach((w) => pts.push([w.lat, w.lng]));
        map.fitBounds(L.latLngBounds(pts), { padding: [38, 38], maxZoom: 13, animate: true });
      }
      return;
    }

    lastFittedRouteRef.current = '';
    if (interactivePinMode && typeof destLat === 'number' && typeof destLng === 'number') {
      map.panTo([destLat, destLng], { animate: true });
    } else if (!userLat && typeof destLat === 'number' && typeof destLng === 'number') {
      map.setView([destLat, destLng], 12, { animate: true });
    }
  }, [interactivePinMode, destLat, destLng, userLat, userLng, routeWaypoints]);

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [];
    if (typeof userLat === 'number' && typeof userLng === 'number') pts.push([userLat, userLng]);
    if (typeof destLat === 'number' && typeof destLng === 'number') pts.push([destLat, destLng]);
    if (routeWaypoints.length >= 2) {
      routeWaypoints.forEach((w) => pts.push([w.lat, w.lng]));
    }

    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 14 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 13, { animate: true });
    } else {
      map.setView([centerLat, centerLng], zoom, { animate: true });
    }
  };

  const handleMumbaiOverview = () => {
    mapRef.current?.setView([19.085, 72.93], 11, { animate: true });
  };

  return (
    <div className={`dark-map-tiles relative overflow-hidden bg-[#070b14] ${className}`}>
      {/* Radar Grid Backdrop (stays crisp if tiles are offline) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 45%, rgba(34,211,238,0.16), transparent 60%), linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 32px 32px, 32px 32px',
        }}
      />

      <div ref={containerRef} className="relative z-10 h-full w-full" />

      {interactivePinMode && (
        <div className="pointer-events-none absolute left-4 bottom-8 z-20 rounded-full border border-cyan-400/30 bg-[#0b101c]/90 px-3.5 py-1.5 text-xs font-medium text-cyan-200 shadow-lg backdrop-blur-md">
          Tap anywhere on the map to drop your destination pin
        </div>
      )}

      {/* Map Utility Controls (docked clean right) */}
      <div className="absolute right-3.5 top-16 z-20 flex flex-col gap-2 lg:top-4">
        <button
          type="button"
          onClick={handleFitBounds}
          aria-label="Fit active route on map"
          title="Focus route"
          className="pressable flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0b101c]/90 text-slate-200 shadow-lg backdrop-blur-md hover:border-cyan-400/40 hover:text-cyan-300"
        >
          <Crosshair className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleMumbaiOverview}
          aria-label="Reset to Mumbai network overview"
          title="Mumbai overview"
          className="pressable flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#0b101c]/90 text-slate-200 shadow-lg backdrop-blur-md hover:border-cyan-400/40 hover:text-cyan-300"
        >
          <Layers className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
