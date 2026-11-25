import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Crosshair } from 'lucide-react';

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
  className = 'h-64 w-full',
  zoom = 12,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom,
      zoomControl: false,
      attributionControl: true,
    });

    // OpenStreetMap tiles (cached automatically by service worker sw.js)
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

    // Ensure Leaflet sizes properly inside animated mobile containers
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers, route polyline, and alert circle
  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    // 1. Route polyline & intermediate stations
    if (routeWaypoints.length >= 2) {
      const latLngs: L.LatLngExpression[] = routeWaypoints.map((w) => [w.lat, w.lng]);
      L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 4,
        opacity: 0.75,
        dashArray: '8 8',
      }).addTo(group);

      routeWaypoints.forEach((wp, idx) => {
        if (idx === routeWaypoints.length - 1) return;
        L.circleMarker([wp.lat, wp.lng], {
          radius: 4,
          color: '#0ea5e9',
          fillColor: '#060911',
          fillOpacity: 1,
          weight: 2,
        })
          .bindTooltip(wp.name, { direction: 'top' })
          .addTo(group);
      });
    }

    // 2. Destination pin & Alert Radius Circle
    if (typeof destLat === 'number' && typeof destLng === 'number') {
      const circleColor = isAlerting ? '#ef4444' : isDeadReckoning ? '#f59e0b' : '#22d3ee';
      L.circle([destLat, destLng], {
        radius: Math.max(100, alertRadiusKm * 1000),
        color: circleColor,
        weight: 2,
        fillColor: circleColor,
        fillOpacity: isAlerting ? 0.25 : 0.14,
        dashArray: isDeadReckoning ? '6 6' : undefined,
      }).addTo(group);

      const destIcon = L.divIcon({
        className: 'wakeme-dest-icon',
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:28px;height:28px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:${circleColor};opacity:0.3;"></span>
          <span style="width:14px;height:14px;border-radius:9999px;background:${circleColor};border:2.5px solid #060911;box-shadow:0 0 12px ${circleColor};"></span>
        </div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([destLat, destLng], { icon: destIcon }).addTo(group);
      if (destName) {
        marker.bindTooltip(`${destName} (${alertRadiusKm.toFixed(1)} km alert)`, {
          direction: 'top',
          offset: [0, -10],
        });
      }
    }

    // 3. User / Train Live Marker
    if (typeof userLat === 'number' && typeof userLng === 'number') {
      const userColor = isDeadReckoning ? '#f59e0b' : '#10b981';
      const userIcon = L.divIcon({
        className: 'wakeme-user-icon',
        html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:30px;height:30px;">
          <span style="position:absolute;width:28px;height:28px;border-radius:9999px;background:${userColor};opacity:0.28;"></span>
          <span style="width:13px;height:13px;border-radius:9999px;background:${userColor};border:2.5px solid #ffffff;box-shadow:0 0 10px ${userColor};"></span>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      L.marker([userLat, userLng], { icon: userIcon })
        .bindTooltip(isDeadReckoning ? 'Estimated Position (Fallback)' : 'Current Location', {
          direction: 'top',
        })
        .addTo(group);
    }
  }, [destLat, destLng, destName, userLat, userLng, alertRadiusKm, routeWaypoints, isDeadReckoning, isAlerting]);

  // Smooth pan when center changes in interactive pin mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (interactivePinMode && typeof destLat === 'number' && typeof destLng === 'number') {
      map.panTo([destLat, destLng], { animate: true });
    }
  }, [interactivePinMode, destLat, destLng]);

  const handleFitBounds = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts: L.LatLngExpression[] = [];
    if (typeof userLat === 'number' && typeof userLng === 'number') pts.push([userLat, userLng]);
    if (typeof destLat === 'number' && typeof destLng === 'number') pts.push([destLat, destLng]);

    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 14 });
    } else if (pts.length === 1) {
      map.setView(pts[0], 13, { animate: true });
    } else {
      map.setView([centerLat, centerLng], zoom, { animate: true });
    }
  };

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-800/80 bg-[#0b1120] ${className}`}>
      {/* Offline Radar Fallback Background Grid (visible if OSM tiles fail offline) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 50%, rgba(34,211,238,0.16), transparent 65%), linear-gradient(to right, rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 28px 28px, 28px 28px',
        }}
      />

      <div ref={containerRef} className="relative z-10 h-full w-full" />

      {interactivePinMode && (
        <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full border border-cyan-500/30 bg-slate-950/85 px-3 py-1 text-[11px] font-medium text-cyan-300 backdrop-blur">
          Tap anywhere on map to drop pin
        </div>
      )}

      <button
        type="button"
        onClick={handleFitBounds}
        aria-label="Center map view"
        className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-slate-700/80 bg-slate-950/85 text-slate-200 shadow-lg backdrop-blur transition active:scale-95 hover:border-cyan-500/50 hover:text-cyan-300"
      >
        <Crosshair className="h-4 w-4" />
      </button>
    </div>
  );
};
