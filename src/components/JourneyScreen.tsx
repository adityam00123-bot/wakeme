import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  BatteryCharging,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  MapPin,
  Navigation,
  Pause,
  Play,
  Radio,
  Satellite,
  SlidersHorizontal,
  Square,
  TrainFront,
  Volume2,
  WifiOff,
  Zap,
} from 'lucide-react';
import { MUMBAI_PRESET_ROUTES, MUMBAI_STATIONS, getStationById } from '../data/mumbaiLocal';
import {
  buildRouteWaypoints,
  computeRouteProgress,
  findNearestStation,
  formatDurationCompact,
  haversineDistanceKm,
} from '../services/geoEngine';
import { getCurrentPositionUnified, isGeoAvailable } from '../services/nativeGeo';
import {
  Destination,
  JourneyRecord,
  LiveTrackingState,
  MumbaiPresetRoute,
  RouteWaypoint,
  UserPreferences,
} from '../types/wakeme';
import { LiveMap } from './LiveMap';

export interface StartJourneyConfig {
  mode: 'live_gps' | 'simulator';
  destination: Destination;
  startName: string;
  startLat: number;
  startLng: number;
  alertRadiusKm: number;
  expectedStops: number;
  routeId?: string;
  waypoints?: RouteWaypoint[];
  avgSpeedKmh?: number;
}

interface JourneyScreenProps {
  theme: 'light' | 'dark';
  destinations: Destination[];
  preferences: UserPreferences;
  selectedDestination: Destination | null;
  selectedPresetRoute: MumbaiPresetRoute | null;
  activeJourney: JourneyRecord | null;
  liveState: LiveTrackingState | null;
  onStartJourney: (config: StartJourneyConfig) => void;
  onSwitchToSearch: () => void;
  onSwitchToSimulator: () => void;
  onPauseResume: () => void;
  onStopJourney: () => void;
  onSimulateSignalDrop: () => void;
  onRestoreSignal: () => void;
  onChangeSimSpeed: (multiplier: number) => void;
  onJumpNearAlert: () => void;
  onForceTestAlarm: () => void;
  onUpdateAlertRadius: (km: number) => void;
}

export const JourneyScreen: React.FC<JourneyScreenProps> = ({
  theme,
  destinations,
  preferences,
  selectedDestination,
  selectedPresetRoute,
  activeJourney,
  liveState,
  onStartJourney,
  onSwitchToSearch,
  onSwitchToSimulator,
  onPauseResume,
  onStopJourney,
  onSimulateSignalDrop,
  onRestoreSignal,
  onChangeSimSpeed,
  onJumpNearAlert,
  onForceTestAlarm,
  onUpdateAlertRadius,
}) => {
  const [mode, setMode] = useState<'simulator' | 'live_gps'>('simulator');
  const [activePresetId, setActivePresetId] = useState<string | undefined>(selectedPresetRoute?.id);
  const [originStationId, setOriginStationId] = useState<string>(
    selectedPresetRoute?.stationIds[0] || 'cr-csmt'
  );
  const [destId, setDestId] = useState<string>(
    selectedDestination?.destination_id || destinations[0]?.destination_id || ''
  );
  const [customStartOverride, setCustomStartOverride] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);
  const [customDestOverride, setCustomDestOverride] = useState<Destination | null>(null);

  const [alertRadiusKm, setAlertRadiusKm] = useState<number>(
    selectedPresetRoute?.defaultAlertKm || preferences.defaultAlertRadiusKm
  );
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [capturedGps, setCapturedGps] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);

  const [showAllPreviewStops, setShowAllPreviewStops] = useState(false);
  const [showPassedStops, setShowPassedStops] = useState(false);
  const [showDemoControls, setShowDemoControls] = useState(true);

  useEffect(() => {
    if (selectedPresetRoute) {
      setMode('simulator');
      setActivePresetId(selectedPresetRoute.id);
      setOriginStationId(selectedPresetRoute.stationIds[0]);
      setCustomStartOverride(null);
      const endSt = getStationById(
        selectedPresetRoute.stationIds[selectedPresetRoute.stationIds.length - 1]
      );
      if (endSt) {
        setCustomDestOverride({
          destination_id: `route-dest-${endSt.id}`,
          user_id: destinations[0]?.user_id || 'guest-commuter',
          destination_name: endSt.name,
          subtitle: selectedPresetRoute.title,
          category: 'Station',
          line: selectedPresetRoute.line,
          latitude: endSt.lat,
          longitude: endSt.lng,
          favourite_status: true,
          created_at: new Date().toISOString(),
        });
      }
      setAlertRadiusKm(selectedPresetRoute.defaultAlertKm);
      setShowAllPreviewStops(false);
    } else if (selectedDestination) {
      setActivePresetId(undefined);
      setCustomDestOverride(null);
      setCustomStartOverride(null);
      setDestId(selectedDestination.destination_id);
      setAlertRadiusKm(preferences.defaultAlertRadiusKm);
      setShowAllPreviewStops(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDestination, selectedPresetRoute]);

  // Passive non-blocking GPS lookup when Live GPS mode is selected
  useEffect(() => {
    if (mode !== 'live_gps' || capturedGps || !isGeoAvailable()) return;
    let cancelled = false;
    setGpsLoading(true);
    void getCurrentPositionUnified(6000)
      .then((pos) => {
        if (cancelled) return;
        const near = findNearestStation(pos.latitude, pos.longitude, 5.0);
        setCapturedGps({
          lat: pos.latitude,
          lng: pos.longitude,
          label: near ? `GPS · Near ${near.station.name}` : 'Live GPS Fix',
        });
        setGpsLoading(false);
        setGpsError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setGpsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, capturedGps]);

  const originInfo = useMemo(() => {
    if (mode === 'live_gps' && capturedGps) {
      return {
        name: capturedGps.label,
        lat: capturedGps.lat,
        lng: capturedGps.lng,
      };
    }
    if (customStartOverride) {
      return customStartOverride;
    }
    const st = getStationById(originStationId) || MUMBAI_STATIONS[0];
    return { name: st.name, lat: st.lat, lng: st.lng };
  }, [mode, capturedGps, customStartOverride, originStationId]);

  const effectiveDest: Destination = useMemo(() => {
    if (customDestOverride) return customDestOverride;
    return destinations.find((d) => d.destination_id === destId) || destinations[0];
  }, [customDestOverride, destinations, destId]);

  const previewWaypoints = useMemo(() => {
    if (!effectiveDest) return [];
    return buildRouteWaypoints({
      startLat: originInfo.lat,
      startLng: originInfo.lng,
      startName: originInfo.name,
      destLat: effectiveDest.latitude,
      destLng: effectiveDest.longitude,
      destName: effectiveDest.destination_name,
      destLine: effectiveDest.line,
      presetRouteId: activePresetId,
    });
  }, [originInfo, effectiveDest, activePresetId]);

  const previewTotalKm = useMemo(() => {
    if (previewWaypoints.length < 2) return 0;
    return (
      previewWaypoints[previewWaypoints.length - 1].cumDistKm ??
      haversineDistanceKm(
        originInfo.lat,
        originInfo.lng,
        effectiveDest.latitude,
        effectiveDest.longitude
      )
    );
  }, [previewWaypoints, originInfo, effectiveDest]);

  const activePresetObj = MUMBAI_PRESET_ROUTES.find((r) => r.id === activePresetId);
  const previewAvgSpeed =
    activePresetObj?.avgSpeedKmh ||
    (effectiveDest?.line === 'Bus'
      ? 62
      : effectiveDest?.line === 'Express' || previewTotalKm > 60
      ? 78
      : 48);

  const handleCaptureGps = () => {
    if (!isGeoAvailable()) {
      setGpsError('Geolocation API unavailable on this device.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    void getCurrentPositionUnified(8000)
      .then((pos) => {
        const near = findNearestStation(pos.latitude, pos.longitude, 5.0);
        setCapturedGps({
          lat: pos.latitude,
          lng: pos.longitude,
          label: near ? `GPS · Near ${near.station.name}` : 'Live GPS Fix',
        });
        setGpsLoading(false);
      })
      .catch((err: { message?: string }) => {
        setGpsError(err?.message || 'GPS unavailable indoors — switch to Simulator for demo.');
        setGpsLoading(false);
      });
  };

  const handleSelectQuickPreset = (preset: MumbaiPresetRoute) => {
    const startSt = getStationById(preset.stationIds[0]);
    const endSt = getStationById(preset.stationIds[preset.stationIds.length - 1]);
    if (!startSt || !endSt) return;
    setActivePresetId(preset.id);
    setOriginStationId(startSt.id);
    setCustomStartOverride(null);
    setCustomDestOverride({
      destination_id: `route-dest-${endSt.id}`,
      user_id: effectiveDest?.user_id || 'guest-commuter',
      destination_name: endSt.name,
      subtitle: preset.title,
      category: 'Station',
      line: preset.line,
      latitude: endSt.lat,
      longitude: endSt.lng,
      favourite_status: true,
      created_at: new Date().toISOString(),
    });
    setAlertRadiusKm(preset.defaultAlertKm);
    setShowAllPreviewStops(false);
  };

  const handleSwapEndpoints = () => {
    if (mode !== 'simulator' || !effectiveDest) return;
    const oldStart = { ...originInfo };
    const oldDest = effectiveDest;

    setActivePresetId(undefined);
    setCustomStartOverride({
      name: oldDest.destination_name,
      lat: oldDest.latitude,
      lng: oldDest.longitude,
    });
    setCustomDestOverride({
      destination_id: `swap-${Date.now().toString(36)}`,
      user_id: oldDest.user_id,
      destination_name: oldStart.name,
      subtitle: 'Reversed corridor stop',
      category: 'Station',
      line: oldDest.line,
      latitude: oldStart.lat,
      longitude: oldStart.lng,
      favourite_status: false,
      created_at: new Date().toISOString(),
    });
  };

  const handleLaunch = () => {
    if (!effectiveDest) return;
    const intermediateCount = Math.max(0, previewWaypoints.length - 2);
    onStartJourney({
      mode,
      destination: effectiveDest,
      startName: originInfo.name,
      startLat: originInfo.lat,
      startLng: originInfo.lng,
      alertRadiusKm,
      expectedStops: intermediateCount,
      routeId: activePresetId,
      waypoints: previewWaypoints,
      avgSpeedKmh: previewAvgSpeed,
    });
  };

  // ==============================================================
  // ACTIVE TRIP VIEW
  // ==============================================================
  if (activeJourney && liveState) {
    const batterySaved =
      liveState.staticBaselineChecks > 0
        ? Math.max(
            0,
            Math.round(
              ((liveState.staticBaselineChecks - liveState.gpsChecksPerformed) /
                liveState.staticBaselineChecks) *
                100
            )
          )
        : 0;

    const isDR = liveState.deadReckoningActive;
    const evalLat = isDR && liveState.drEstimatedLat !== null ? liveState.drEstimatedLat : liveState.currentLat;
    const evalLng = isDR && liveState.drEstimatedLng !== null ? liveState.drEstimatedLng : liveState.currentLng;

    const routeSnap = computeRouteProgress(
      liveState.routeWaypoints,
      evalLat,
      evalLng,
      activeJourney.configured_alert_distance
    );

    const passedStops = routeSnap.stops.filter((s) => s.isPassed);
    const upcomingStops = routeSnap.stops.filter((s) => !s.isPassed);

    const displayDistanceKm =
      isDR && liveState.drEstimatedDistanceKm !== null
        ? liveState.drEstimatedDistanceKm
        : liveState.distanceKm;

    const progressPct = Math.round(
      Math.min(100, Math.max(0, (isDR && liveState.drProgress0to1 !== null ? liveState.drProgress0to1 : routeSnap.progress0to1) * 100))
    );

    const alertMarkerPct =
      liveState.totalRouteKm > 0
        ? Math.max(
            4,
            Math.min(
              96,
              100 - (activeJourney.configured_alert_distance / liveState.totalRouteKm) * 100
            )
          )
        : 90;

    const statusBadge =
      activeJourney.journey_status === 'paused'
        ? {
            cls: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-white/15 dark:bg-[#1c2331] dark:text-slate-300',
            label: 'Paused',
            pulse: 'bg-slate-400',
          }
        : isDR
        ? {
            cls: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/40 dark:bg-amber-500/20 dark:text-amber-200',
            label: 'Estimated',
            pulse: 'bg-amber-500',
          }
        : liveState.connectionHealth === 'RECALIBRATED'
        ? {
            cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
            label: 'Re-locked',
            pulse: 'bg-emerald-500',
          }
        : activeJourney.mode === 'live_gps'
        ? {
            cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200',
            label: 'Live GPS',
            pulse: 'bg-emerald-500',
          }
        : {
            cls: 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-400/40 dark:bg-blue-500/20 dark:text-blue-200',
            label: 'Simulator',
            pulse: 'bg-blue-500',
          };

    const zoneText =
      liveState.pollingZone === 'ZONE_1_ECO'
        ? `Eco 60s · ${batterySaved}% saved`
        : liveState.pollingZone === 'ZONE_2_BALANCED'
        ? `Balanced 20s · ${batterySaved}% saved`
        : `Precision 3s`;

    const speedSourceLabel =
      liveState.speedSource === 'gps_sensor'
        ? 'Hardware GPS'
        : liveState.speedSource === 'haversine_delta'
        ? 'GPS delta'
        : liveState.speedSource === 'estimated'
        ? liveState.drSpeedIsBaseline
          ? 'Route baseline'
          : 'Locked speed'
        : 'Sim speed';

    return (
      <div className="space-y-4">
        {/* Clean Active Trip Header */}
        <header className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-[-0.025em] text-slate-900 dark:text-white">
              → {activeJourney.destination_name}
            </h1>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              From {activeJourney.start_location_name} · Alert @{' '}
              {activeJourney.configured_alert_distance.toFixed(1)} km
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusBadge.cls}`}
          >
            <span className={`h-2 w-2 rounded-full ${statusBadge.pulse} animate-pulse`} />
            {statusBadge.label}
          </span>
        </header>

        {/* Live Interactive Vector Map + Overlaid Polling Pill */}
        <div className="relative">
          <LiveMap
            theme={theme}
            centerLat={evalLat}
            centerLng={evalLng}
            userLat={liveState.currentLat}
            userLng={liveState.currentLng}
            estimatedLat={isDR ? liveState.drEstimatedLat : null}
            estimatedLng={isDR ? liveState.drEstimatedLng : null}
            destLat={activeJourney.destination_lat}
            destLng={activeJourney.destination_lng}
            destName={activeJourney.destination_name}
            alertRadiusKm={activeJourney.configured_alert_distance}
            routeWaypoints={liveState.routeWaypoints}
            isDeadReckoning={isDR}
            isAlerting={activeJourney.journey_status === 'alerting'}
            className="h-52 w-full"
            zoom={9}
          />
          <div className="pointer-events-none absolute left-2.5 top-2.5 z-20 inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/92 px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-xs backdrop-blur dark:border-white/10 dark:bg-[#141923]/92 dark:text-slate-100">
            <BatteryCharging className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{zoneText}</span>
          </div>
        </div>

        {/* Contextual GPS / Recalibration / Dead-Reckoning Strip */}
        {liveState.recalibrationNotice && (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 dark:border-emerald-400/40 dark:bg-emerald-500/15">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              {liveState.recalibrationNotice}
            </p>
          </div>
        )}

        {liveState.gpsStatusNote && !isDR && !liveState.recalibrationNotice && (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-xs dark:border-blue-500/30 dark:bg-blue-500/15">
            <span className="flex items-center gap-2 font-medium text-blue-900 dark:text-blue-200">
              <Satellite className="h-4 w-4 shrink-0 animate-pulse text-blue-600 dark:text-blue-300" />
              {liveState.gpsStatusNote}
            </span>
            {activeJourney.mode === 'live_gps' &&
              liveState.gpsStatusNote.toLowerCase().includes('denied') && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('simulator');
                    onSwitchToSimulator();
                  }}
                  className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white"
                >
                  Use Demo
                </button>
              )}
          </div>
        )}

        {/* Unified Telemetry + Progress Surface */}
        <section
          className={`overflow-hidden rounded-2xl border shadow-sm transition-colors ${
            isDR
              ? 'border-amber-300 bg-amber-50/90 dark:border-amber-400/40 dark:bg-amber-500/12'
              : 'border-slate-200/80 bg-white dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none'
          }`}
        >
          {isDR && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-200/90 px-4 py-2.5 dark:border-amber-400/20">
              <div className="flex items-center gap-2">
                <WifiOff className="h-4 w-4 shrink-0 animate-pulse text-amber-700 dark:text-amber-300" />
                <span className="text-xs font-bold text-amber-950 dark:text-amber-200">
                  GPS / Signal Lost — Estimated Calculation
                </span>
              </div>
              <span className="font-mono-num shrink-0 rounded-lg bg-amber-200/70 px-2 py-0.5 text-xs font-bold text-amber-950 dark:bg-amber-400/25 dark:text-amber-100">
                Alert in {formatDurationCompact(liveState.drRemainingSec)}
              </span>
            </div>
          )}

          <div
            className={`grid grid-cols-3 divide-x ${
              isDR
                ? 'divide-amber-200/80 dark:divide-amber-400/20'
                : 'divide-slate-100 dark:divide-white/[0.07]'
            }`}
          >
            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {isDR ? 'Est. remaining' : 'Distance left'}
              </p>
              <p
                className={`font-mono-num mt-0.5 text-xl font-extrabold ${
                  isDR
                    ? 'text-amber-950 dark:text-amber-200'
                    : displayDistanceKm <= activeJourney.configured_alert_distance * 1.35
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {isDR ? '~' : ''}
                {displayDistanceKm.toFixed(1)}
                <span className="ml-0.5 text-xs font-medium opacity-70">km</span>
              </p>
            </div>

            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {isDR ? 'Locked speed' : 'Speed'}
              </p>
              <p className="font-mono-num mt-0.5 text-xl font-extrabold text-slate-900 dark:text-white">
                {Math.round(isDR ? liveState.drSnapshotSpeedKmh || liveState.speedKmh : liveState.speedKmh)}
                <span className="ml-0.5 text-xs font-medium text-slate-400">km/h</span>
              </p>
              <p className="mt-0.5 text-[10px] text-slate-400">{speedSourceLabel}</p>
            </div>

            <div className="p-3.5">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                {isDR ? 'Stops buffer' : 'ETA'}
              </p>
              {isDR ? (
                <>
                  <p className="font-mono-num mt-0.5 text-xl font-extrabold text-amber-950 dark:text-amber-200">
                    {liveState.drStopsBufferCount}
                  </p>
                  <p className="mt-0.5 text-[10px] text-amber-800/80 dark:text-amber-200/70">
                    +{(liveState.drStopsBufferCount * preferences.stopBufferMinutesPerStop).toFixed(1)}m buffer
                  </p>
                </>
              ) : (
                <>
                  <p className="font-mono-num mt-0.5 text-xl font-extrabold text-blue-600 dark:text-blue-400">
                    {liveState.etaMinutes !== null
                      ? liveState.etaMinutes >= 60
                        ? `${Math.floor(liveState.etaMinutes / 60)}h ${liveState.etaMinutes % 60}m`
                        : `${liveState.etaMinutes}m`
                      : '--'}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    ±{Math.round(liveState.accuracyMeters)}m GPS
                  </p>
                </>
              )}
            </div>
          </div>

          {isDR && (
            <p className="px-4 pb-2.5 text-[11px] font-medium text-amber-900/85 dark:text-amber-200/85">
              Projecting amber position along corridor. Auto-recalibrates exact distance when GPS or net returns.
            </p>
          )}

          {/* Integrated Route Progress Track */}
          <div className="bg-slate-100/70 px-4 py-2.5 dark:bg-black/25">
            <div className="mb-1.5 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Trip progress · {progressPct}%
              </span>
              <span className="font-mono-num text-slate-500 dark:text-slate-400">
                Next: {routeSnap.nextStationName}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  isDR ? 'bg-amber-500' : 'bg-blue-600 dark:bg-blue-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
              <span
                title={`Alert zone threshold (${activeJourney.configured_alert_distance} km before stop)`}
                className="absolute inset-y-0 w-0.5 bg-rose-500"
                style={{ left: `${alertMarkerPct}%` }}
              />
            </div>
          </div>
        </section>

        {/* Next Stations Strictly Between Origin & Destination */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <TrainFront className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Next stations on route
            </h2>
            <span className="rounded-full bg-[#edf1f7] px-2.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-[#1c2331] dark:text-slate-300">
              {routeSnap.remainingStopsCount > 0
                ? `${routeSnap.remainingStopsCount} ${
                    routeSnap.remainingStopsCount === 1 ? 'stop' : 'stops'
                  } left`
                : 'Final stop next'}
            </span>
          </div>

          {passedStops.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPassedStops((v) => !v)}
              className="mb-2.5 flex w-full items-center justify-between rounded-xl bg-[#f5f7fa] px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:bg-[#0a0d12] dark:text-slate-400 dark:hover:text-slate-200"
            >
              <span>
                {showPassedStops
                  ? `Hide ${passedStops.length} passed ${passedStops.length === 1 ? 'stop' : 'stops'}`
                  : `${passedStops.length} passed ${passedStops.length === 1 ? 'stop' : 'stops'} behind you`}
              </span>
              {showPassedStops ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          <div className="space-y-0">
            {showPassedStops &&
              passedStops.map((stop) => (
                <div key={`passed-${stop.index}`} className="flex items-stretch gap-3 opacity-55">
                  <div className="flex w-4 flex-col items-center">
                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-400 dark:bg-slate-600" />
                    <span className="my-1 w-0.5 flex-1 bg-slate-200 dark:bg-white/10" />
                  </div>
                  <div className="flex flex-1 items-center justify-between pb-3 text-xs">
                    <span className="text-slate-500 line-through dark:text-slate-400">
                      {stop.name}
                    </span>
                    <span className="text-[11px] text-slate-400">Passed</span>
                  </div>
                </div>
              ))}

            {upcomingStops.map((stop, idx) => {
              const isLast = idx === upcomingStops.length - 1;
              const speedForEta =
                (isDR ? liveState.drSnapshotSpeedKmh : liveState.speedKmh) ||
                routeBaselineSpeedRefValue(activeJourney.route_id);
              const etaMin =
                speedForEta > 3 ? Math.max(1, Math.round((stop.distFromUserKm / speedForEta) * 60)) : null;

              return (
                <div key={`up-${stop.index}-${stop.name}`} className="flex items-stretch gap-3">
                  <div className="flex w-4 flex-col items-center">
                    <span
                      className={`mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 ${
                        stop.isDestination
                          ? 'border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400'
                          : stop.isNext
                          ? isDR
                            ? 'border-amber-500 bg-amber-500 ring-4 ring-amber-500/20'
                            : 'border-emerald-500 bg-emerald-500 ring-4 ring-emerald-500/20'
                          : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-[#141923]'
                      }`}
                    />
                    {!isLast && (
                      <span className="my-1 w-0.5 flex-1 bg-slate-200 dark:bg-white/12" />
                    )}
                  </div>

                  <div
                    className={`flex flex-1 items-center justify-between gap-2 ${
                      !isLast ? 'pb-3.5' : 'pb-0.5'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`truncate text-sm ${
                            stop.isNext || stop.isDestination
                              ? 'font-bold text-slate-900 dark:text-white'
                              : 'font-medium text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {stop.name}
                        </span>
                        {stop.code && (
                          <span className="rounded bg-[#edf1f7] px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-[#1c2331] dark:text-slate-300">
                            {stop.code}
                          </span>
                        )}
                      </div>
                      {stop.isNext && !stop.isDestination && (
                        <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {isDR ? 'Estimated next stop' : 'Next stop ahead'}
                          {etaMin !== null ? ` · ~${etaMin} min` : ''}
                        </p>
                      )}
                      {stop.isDestination && (
                        <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                          Destination · Alarm @ {activeJourney.configured_alert_distance.toFixed(1)} km
                        </p>
                      )}
                    </div>

                    <span className="font-mono-num shrink-0 text-xs font-bold text-slate-800 dark:text-slate-200">
                      {isDR ? '~' : ''}
                      {stop.distFromUserKm.toFixed(1)} km
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Live Wake Radius Adjustment */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Wake-up alert radius
            </span>
            <span className="font-mono-num font-bold text-blue-600 dark:text-blue-400">
              {activeJourney.configured_alert_distance.toFixed(1)} km before stop
            </span>
          </div>
          <div className="mb-2 flex gap-1.5">
            {[1.5, 2.0, 5.0, 8.0].map((presetKm) => (
              <button
                key={presetKm}
                type="button"
                onClick={() => onUpdateAlertRadius(presetKm)}
                className={`pressable flex-1 rounded-lg py-1 text-[11px] font-bold ${
                  Math.abs(activeJourney.configured_alert_distance - presetKm) < 0.05
                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                    : 'bg-[#edf1f7] text-slate-600 dark:bg-[#1c2331] dark:text-slate-300'
                }`}
              >
                {presetKm} km
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={activeJourney.configured_alert_distance}
            onChange={(e) => onUpdateAlertRadius(Number(e.target.value))}
            aria-label="Wake-up alert radius in kilometers"
            className="w-full accent-blue-600 dark:accent-blue-500"
          />
        </section>

        {/* Pause / End Trip Primary Row */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onPauseResume}
            className="pressable inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-xs font-bold text-slate-800 shadow-xs dark:border-white/10 dark:bg-[#141923] dark:text-white"
          >
            {activeJourney.journey_status === 'paused' ? (
              <>
                <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Resume Tracking
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 text-amber-500" />
                Pause
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onStopJourney}
            className="pressable inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 py-3.5 text-xs font-bold text-rose-700 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-200"
          >
            <Square className="h-4 w-4 fill-rose-600 dark:fill-rose-400" />
            End Trip
          </button>
        </div>

        {/* Signal Loss, Speed & Alarm Demo Controls */}
        <section className="rounded-2xl border border-blue-200/80 bg-white p-3.5 shadow-sm dark:border-blue-500/25 dark:bg-[#141923] dark:shadow-none">
          <button
            type="button"
            onClick={() => setShowDemoControls((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="inline-flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Signal loss, speed &amp; alarm controls
            </span>
            {showDemoControls ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showDemoControls && (
            <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-white/[0.07]">
              {activeJourney.mode === 'simulator' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Sim speed
                  </span>
                  <div className="flex gap-1.5">
                    {[1, 15, 40, 80].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => onChangeSimSpeed(spd)}
                        className={`pressable rounded-lg px-2.5 py-1 text-xs font-bold ${
                          liveState.simSpeedMultiplier === spd
                            ? 'bg-blue-600 text-white dark:bg-blue-500'
                            : 'bg-[#edf1f7] text-slate-700 dark:bg-[#1c2331] dark:text-slate-300'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className={`grid gap-2 ${activeJourney.mode === 'simulator' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {!isDR ? (
                  <button
                    type="button"
                    onClick={onSimulateSignalDrop}
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-xs font-bold text-amber-800 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Drop GPS / Signal
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRestoreSignal}
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-bold text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/20 dark:text-emerald-200"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    Restore GPS / Signal
                  </button>
                )}

                {activeJourney.mode === 'simulator' && (
                  <button
                    type="button"
                    onClick={onJumpNearAlert}
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-[#edf1f7] py-2.5 text-xs font-bold text-slate-800 dark:border-white/10 dark:bg-[#1c2331] dark:text-slate-200"
                  >
                    <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                    Skip Near Alert
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={onForceTestAlarm}
                className="pressable flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-bold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200"
              >
                <BellRing className="h-3.5 w-3.5" />
                Ring Alarm, Sound &amp; Vibrate Now
              </button>
            </div>
          )}
        </section>
      </div>
    );
  }

  // ==============================================================
  // PRE-TRIP ROUTE SETUP VIEW (Maps/Transit Style)
  // ==============================================================
  const estTotalMinutes = Math.max(
    1,
    Math.round((previewTotalKm / Math.max(20, previewAvgSpeed)) * 60)
  );
  const earlyAlertMinutes = Math.max(
    1,
    Math.round((alertRadiusKm / Math.max(20, previewAvgSpeed)) * 60)
  );
  const visiblePreviewStops =
    showAllPreviewStops || previewWaypoints.length <= 6
      ? previewWaypoints
      : [
          previewWaypoints[0],
          previewWaypoints[1],
          ...previewWaypoints.slice(-3),
        ];
  const hiddenPreviewCount = previewWaypoints.length - visiblePreviewStops.length;

  return (
    <div className="space-y-4">
      {/* Header + Clean Tracking Mode Pill Switch */}
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold tracking-[-0.025em] text-slate-900 dark:text-white">
          Trip setup
        </h1>
        <div className="inline-flex rounded-xl border border-slate-200 bg-[#edf1f7] p-1 dark:border-white/[0.08] dark:bg-[#141923]">
          <button
            type="button"
            onClick={() => setMode('simulator')}
            className={`pressable inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
              mode === 'simulator'
                ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <TrainFront className="h-3.5 w-3.5" />
            Demo Sim
          </button>
          <button
            type="button"
            onClick={() => setMode('live_gps')}
            className={`pressable inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold ${
              mode === 'live_gps'
                ? 'bg-white text-emerald-700 shadow-xs dark:bg-emerald-600 dark:text-white'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Satellite className="h-3.5 w-3.5" />
            Live GPS
          </button>
        </div>
      </header>

      {/* Quick Corridor Chips (1-Tap Load Popular Routes) */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
        {MUMBAI_PRESET_ROUTES.map((route) => {
          const shortTitle = route.title.split('(')[0].trim();
          const selected = activePresetId === route.id;
          return (
            <button
              key={route.id}
              type="button"
              onClick={() => {
                handleSelectQuickPreset(route);
              }}
              className={`pressable shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                selected
                  ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 dark:border-white/[0.08] dark:bg-[#141923] dark:text-slate-200'
              }`}
            >
              {shortTitle}
            </button>
          );
        })}
      </div>

      {/* Unified Origin -> Destination Connector Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center gap-3">
          {/* Vertical Track Icons */}
          <div className="flex flex-col items-center py-2">
            <span className="h-3 w-3 rounded-full border-2 border-emerald-500 bg-emerald-500/20" />
            <span className="my-1.5 h-8 w-0.5 border-l-2 border-dotted border-slate-300 dark:border-white/20" />
            <MapPin className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>

          {/* Origin + Destination Fields */}
          <div className="min-w-0 flex-1 space-y-2.5">
            {mode === 'simulator' ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="origin-select"
                    className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                  >
                    Starting from
                  </label>
                  <select
                    id="origin-select"
                    value={customStartOverride ? '__custom__' : originStationId}
                    onChange={(e) => {
                      setActivePresetId(undefined);
                      setCustomStartOverride(null);
                      setOriginStationId(e.target.value);
                    }}
                    className="w-full truncate bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
                  >
                    {customStartOverride && (
                      <option value="__custom__">{customStartOverride.name}</option>
                    )}
                    {MUMBAI_STATIONS.map((st) => (
                      <option key={st.id} value={st.id} className="bg-white text-slate-900 dark:bg-[#141923] dark:text-white">
                        {st.name.includes(`(${st.code})`) || st.id === 'cr-csmt'
                          ? `${st.name} · ${st.line}`
                          : `${st.name} (${st.code}) · ${st.line}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                    Current GPS location
                  </p>
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {capturedGps
                      ? `${capturedGps.label}`
                      : gpsLoading
                      ? 'Detecting phone GPS…'
                      : `Fallback: ${originInfo.name}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCaptureGps}
                  disabled={gpsLoading}
                  className="pressable inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  {gpsLoading ? 'Locking…' : 'Detect'}
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
              <div className="min-w-0 flex-1">
                <label
                  htmlFor="dest-select"
                  className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  Destination stop
                </label>
                <select
                  id="dest-select"
                  value={customDestOverride ? '__preset_dest__' : effectiveDest?.destination_id || ''}
                  onChange={(e) => {
                    setActivePresetId(undefined);
                    setCustomDestOverride(null);
                    setDestId(e.target.value);
                  }}
                  className="w-full truncate bg-transparent text-sm font-semibold text-slate-900 outline-none dark:text-white"
                >
                  {customDestOverride && (
                    <option value="__preset_dest__" className="bg-white text-slate-900 dark:bg-[#141923] dark:text-white">
                      {customDestOverride.destination_name}
                    </option>
                  )}
                  {destinations.map((d) => (
                    <option key={d.destination_id} value={d.destination_id} className="bg-white text-slate-900 dark:bg-[#141923] dark:text-white">
                      {d.destination_name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={onSwitchToSearch}
                className="shrink-0 text-[11px] font-bold text-blue-600 hover:underline dark:text-blue-400"
              >
                Search map
              </button>
            </div>
          </div>

          {/* Swap Direction Button (Simulator) */}
          {mode === 'simulator' && (
            <button
              type="button"
              onClick={handleSwapEndpoints}
              aria-label="Swap starting stop and destination"
              className="pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-[#f5f7fa] text-slate-600 hover:text-blue-600 dark:border-white/10 dark:bg-[#0a0d12] dark:text-slate-300"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
          )}
        </div>

        {gpsError && mode === 'live_gps' && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {gpsError}
          </p>
        )}
      </section>

      {/* Interactive Corridor & Geofence Map Preview */}
      {effectiveDest && (
        <LiveMap
          theme={theme}
          centerLat={(originInfo.lat + effectiveDest.latitude) / 2}
          centerLng={(originInfo.lng + effectiveDest.longitude) / 2}
          userLat={originInfo.lat}
          userLng={originInfo.lng}
          destLat={effectiveDest.latitude}
          destLng={effectiveDest.longitude}
          destName={effectiveDest.destination_name}
          alertRadiusKm={alertRadiusKm}
          routeWaypoints={previewWaypoints}
          className="h-44 w-full"
          zoom={9}
        />
      )}

      {/* Alert Radius & Route Intermediate Stations Preview */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Wake-up distance threshold
            </span>
            <span className="font-mono-num shrink-0 whitespace-nowrap rounded-lg bg-blue-50 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {alertRadiusKm.toFixed(1)} km · ~{earlyAlertMinutes}m early
            </span>
          </div>
          <div className="mb-2 flex gap-1.5">
            {[1.5, 2.0, 5.0, 8.0].map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setAlertRadiusKm(km)}
                className={`pressable flex-1 rounded-lg py-1.5 text-xs font-bold ${
                  Math.abs(alertRadiusKm - km) < 0.05
                    ? 'bg-blue-600 text-white dark:bg-blue-500'
                    : 'bg-[#edf1f7] text-slate-600 dark:bg-[#1c2331] dark:text-slate-300'
                }`}
              >
                {km} km
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={alertRadiusKm}
            onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
            aria-label="Wake-up distance threshold"
            className="w-full accent-blue-600 dark:accent-blue-500"
          />
        </div>

        {/* Intermediate Stations Strictly Between Start & Destination */}
        <div className="border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
          <div className="mb-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="font-bold text-slate-900 dark:text-white">
              Stops on your route ({Math.max(0, previewWaypoints.length - 2)} in between)
            </span>
            <span className="font-mono-num shrink-0 whitespace-nowrap font-semibold text-slate-500 dark:text-slate-400">
              {previewTotalKm.toFixed(1)} km · ~{estTotalMinutes >= 60 ? `${Math.floor(estTotalMinutes / 60)}h ${estTotalMinutes % 60}m` : `${estTotalMinutes}m`}
            </span>
          </div>

          <div className="space-y-0">
            {visiblePreviewStops.map((wp, idx) => {
              const isFirst = wp === previewWaypoints[0];
              const isLast = wp === previewWaypoints[previewWaypoints.length - 1];
              const showEllipsisGap =
                !showAllPreviewStops &&
                hiddenPreviewCount > 0 &&
                idx === 1;

              return (
                <React.Fragment key={`pre-${wp.name}-${idx}`}>
                  <div className="flex items-stretch gap-3">
                    <div className="flex w-4 flex-col items-center">
                      <span
                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                          isFirst
                            ? 'border-emerald-500 bg-emerald-500'
                            : isLast
                            ? 'border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400'
                            : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-[#141923]'
                        }`}
                      />
                      {!isLast && (
                        <span className="my-0.5 w-0.5 flex-1 bg-slate-200 dark:bg-white/10" />
                      )}
                    </div>
                    <div
                      className={`flex flex-1 items-center justify-between text-xs ${
                        !isLast ? 'pb-2.5' : ''
                      }`}
                    >
                      <span
                        className={`truncate ${
                          isFirst || isLast
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {wp.name}
                      </span>
                      <span className="font-mono-num shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                        {isFirst
                          ? 'Start'
                          : `${(wp.cumDistKm ?? 0).toFixed(1)} km`}
                      </span>
                    </div>
                  </div>

                  {showEllipsisGap && (
                    <button
                      type="button"
                      onClick={() => setShowAllPreviewStops(true)}
                      className="my-1 ml-7 inline-flex items-center gap-1 rounded-lg bg-[#edf1f7] px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:underline dark:bg-[#1c2331] dark:text-blue-400"
                    >
                      + Show {hiddenPreviewCount} more stops in between
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {showAllPreviewStops && previewWaypoints.length > 6 && (
            <button
              type="button"
              onClick={() => setShowAllPreviewStops(false)}
              className="mt-1 ml-7 text-[11px] font-semibold text-slate-500 hover:underline dark:text-slate-400"
            >
              Collapse stops list
            </button>
          )}
        </div>
      </section>

      {/* Primary Action CTA (Unlocks Sound, Vibration, Keep-Alive & WakeLock) */}
      <button
        type="button"
        onClick={handleLaunch}
        className={`pressable flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-white shadow-md ${
          mode === 'live_gps'
            ? 'bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400'
            : 'bg-blue-600 shadow-blue-600/20 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400'
        }`}
      >
        {mode === 'live_gps' ? (
          <>
            <Satellite className="h-4 w-4" />
            Start Live GPS &amp; Arm Alarm
          </>
        ) : (
          <>
            <Navigation className="h-4 w-4" />
            Start Demo &amp; Arm Alarm
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        <Volume2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
        Unlocks loud chime, vibration &amp; Dead-Reckoning guard on tap
      </p>
    </div>
  );
};

function routeBaselineSpeedRefValue(routeId?: string): number {
  const found = MUMBAI_PRESET_ROUTES.find((r) => r.id === routeId);
  return found?.avgSpeedKmh || 58;
}
