import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Compass,
  Gauge,
  Navigation,
  Pause,
  Play,
  Radio,
  Satellite,
  SlidersHorizontal,
  Square,
  TrainFront,
  WifiOff,
  Zap,
} from 'lucide-react';
import { MUMBAI_PRESET_ROUTES, MUMBAI_STATIONS, getStationById } from '../data/mumbaiLocal';
import { formatDurationCompact, haversineDistanceKm } from '../services/geoEngine';
import {
  Destination,
  JourneyRecord,
  LiveTrackingState,
  MumbaiPresetRoute,
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
}

interface JourneyScreenProps {
  destinations: Destination[];
  preferences: UserPreferences;
  selectedDestination: Destination | null;
  selectedPresetRoute: MumbaiPresetRoute | null;
  activeJourney: JourneyRecord | null;
  liveState: LiveTrackingState | null;
  onStartJourney: (config: StartJourneyConfig) => void;
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
  destinations,
  preferences,
  selectedDestination,
  selectedPresetRoute,
  activeJourney,
  liveState,
  onStartJourney,
  onPauseResume,
  onStopJourney,
  onSimulateSignalDrop,
  onRestoreSignal,
  onChangeSimSpeed,
  onJumpNearAlert,
  onForceTestAlarm,
  onUpdateAlertRadius,
}) => {
  // Pre-journey config state
  const [mode, setMode] = useState<'simulator' | 'live_gps'>('simulator');
  const [simSourceType, setSimSourceType] = useState<'preset' | 'custom'>(
    selectedDestination && !selectedPresetRoute ? 'custom' : 'preset'
  );
  const [routeId, setRouteId] = useState<string>(
    selectedPresetRoute?.id || MUMBAI_PRESET_ROUTES[0].id
  );
  const [destId, setDestId] = useState<string>(
    selectedDestination?.destination_id || destinations[0]?.destination_id || ''
  );
  const [originStationId, setOriginStationId] = useState<string>('cr-csmt');
  const [alertRadiusKm, setAlertRadiusKm] = useState<number>(
    selectedPresetRoute?.defaultAlertKm || preferences.defaultAlertRadiusKm
  );
  const [expectedStops, setExpectedStops] = useState<number>(3);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [capturedGps, setCapturedGps] = useState<{ lat: number; lng: number } | null>(null);
  const [showDemoControls, setShowDemoControls] = useState(true);

  React.useEffect(() => {
    if (selectedPresetRoute) {
      setMode('simulator');
      setSimSourceType('preset');
      setRouteId(selectedPresetRoute.id);
      setAlertRadiusKm(selectedPresetRoute.defaultAlertKm);
    } else if (selectedDestination) {
      setDestId(selectedDestination.destination_id);
      setSimSourceType('custom');
    }
  }, [selectedDestination, selectedPresetRoute]);

  const chosenDest = useMemo(
    () => destinations.find((d) => d.destination_id === destId) || destinations[0],
    [destinations, destId]
  );

  const activeRouteWaypoints = useMemo(() => {
    const rId = activeJourney?.route_id || (mode === 'simulator' ? routeId : undefined);
    const preset = MUMBAI_PRESET_ROUTES.find((r) => r.id === rId);
    if (preset) {
      return preset.stationIds
        .map((id) => getStationById(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }));
    }
    if (activeJourney) {
      return [
        {
          name: activeJourney.start_location_name,
          lat: activeJourney.start_lat,
          lng: activeJourney.start_lng,
        },
        {
          name: activeJourney.destination_name,
          lat: activeJourney.destination_lat,
          lng: activeJourney.destination_lng,
        },
      ];
    }
    return [];
  }, [activeJourney, mode, routeId]);

  const activePreset = MUMBAI_PRESET_ROUTES.find((r) => r.id === routeId);
  const previewDistKm = useMemo(() => {
    if (mode !== 'simulator') return null;
    if (simSourceType === 'preset' && activePreset) {
      const s0 = getStationById(activePreset.stationIds[0]);
      const sLast = getStationById(activePreset.stationIds[activePreset.stationIds.length - 1]);
      if (s0 && sLast) {
        return haversineDistanceKm(s0.lat, s0.lng, sLast.lat, sLast.lng);
      }
    }
    const startSt = getStationById(originStationId);
    if (startSt && chosenDest) {
      return haversineDistanceKm(startSt.lat, startSt.lng, chosenDest.latitude, chosenDest.longitude);
    }
    return null;
  }, [mode, simSourceType, activePreset, originStationId, chosenDest]);

  const handleCaptureGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsError('Geolocation API unavailable on this browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCapturedGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message || 'GPS unavailable indoors — switch to Simulator Mode for demo.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  };

  const handleLaunch = () => {
    if (!chosenDest) return;

    if (mode === 'simulator') {
      const preset = MUMBAI_PRESET_ROUTES.find((r) => r.id === routeId);
      if (simSourceType === 'preset' && preset) {
        const startSt = getStationById(preset.stationIds[0])!;
        const endSt = getStationById(preset.stationIds[preset.stationIds.length - 1])!;
        const syntheticDest: Destination = {
          destination_id: `route-dest-${endSt.id}`,
          user_id: chosenDest.user_id,
          destination_name: `${endSt.name} (${preset.line})`,
          subtitle: `${preset.title}`,
          category: 'Station',
          line: preset.line,
          latitude: endSt.lat,
          longitude: endSt.lng,
          favourite_status: true,
          created_at: new Date().toISOString(),
        };
        onStartJourney({
          mode: 'simulator',
          destination: syntheticDest,
          startName: startSt.name,
          startLat: startSt.lat,
          startLng: startSt.lng,
          alertRadiusKm,
          expectedStops: Math.max(1, preset.stationIds.length - 2),
          routeId: preset.id,
        });
        return;
      }

      const originSt = getStationById(originStationId) || MUMBAI_STATIONS[0];
      onStartJourney({
        mode: 'simulator',
        destination: chosenDest,
        startName: originSt.name,
        startLat: originSt.lat,
        startLng: originSt.lng,
        alertRadiusKm,
        expectedStops,
      });
      return;
    }

    // Live GPS Mode
    const startLat = capturedGps?.lat ?? 19.0185;
    const startLng = capturedGps?.lng ?? 72.8435;
    onStartJourney({
      mode: 'live_gps',
      destination: chosenDest,
      startName: capturedGps ? 'Current Device GPS' : 'Mumbai (Acquiring GPS)',
      startLat,
      startLng,
      alertRadiusKm,
      expectedStops,
    });
  };

  // ==============================================================
  // ACTIVE JOURNEY LIVE RADAR VIEW
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

    const zoneBadgeColor =
      liveState.pollingZone === 'ZONE_3_HIGH'
        ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
        : liveState.pollingZone === 'ZONE_2_BALANCED'
        ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
        : 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300';

    return (
      <div className="space-y-3.5 pb-28">
        {/* Compact Top Header */}
        <header className="flex items-center justify-between pt-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {activeJourney.mode === 'simulator' ? 'Mumbai Local Sim' : 'Live GPS Tracking'}
              </span>
            </div>
            <h1 className="truncate text-base font-extrabold text-white">
              {activeJourney.start_location_name} → {activeJourney.destination_name}
            </h1>
          </div>

          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold ${zoneBadgeColor}`}>
            {liveState.pollingZone === 'ZONE_1_ECO'
              ? 'ECO • 60s'
              : liveState.pollingZone === 'ZONE_2_BALANCED'
              ? 'BALANCED • 20s'
              : 'PRECISION • 3s'}
          </span>
        </header>

        {/* Connection & Dead-Reckoning Fallback Banner */}
        {liveState.deadReckoningActive ? (
          <div className="rounded-2xl border border-amber-500/50 bg-amber-500/15 p-3.5 shadow-lg shadow-amber-500/10">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2.5">
                <WifiOff className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-amber-400" />
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-wide text-amber-300">
                    Signal / Internet Lost — Dead-Reckoning Active
                  </p>
                  <p className="mt-0.5 text-[11px] text-amber-100/90">
                    Locked @ {liveState.drSnapshotDistanceKm?.toFixed(2)} km •{' '}
                    {Math.round(liveState.drSnapshotSpeedKmh || 0)} km/h •{' '}
                    {liveState.drStopsBufferCount} stops buffer
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase text-amber-300">Fallback Alert</p>
                <p className="font-mono-num text-lg font-extrabold text-white">
                  {formatDurationCompact(liveState.drRemainingSec)}
                </p>
              </div>
            </div>
          </div>
        ) : liveState.recalibrationNotice ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-500/50 bg-emerald-500/15 p-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            <p className="text-xs font-bold text-emerald-200">{liveState.recalibrationNotice}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/80 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <Satellite className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold text-slate-200">
                Signal Healthy • Accurate GPS Proximity
              </span>
            </div>
            <span className="font-mono-num text-[11px] text-slate-400">
              ±{Math.round(liveState.accuracyMeters)}m
            </span>
          </div>
        )}

        {/* Live Map */}
        <LiveMap
          centerLat={liveState.currentLat}
          centerLng={liveState.currentLng}
          userLat={liveState.currentLat}
          userLng={liveState.currentLng}
          destLat={activeJourney.destination_lat}
          destLng={activeJourney.destination_lng}
          destName={activeJourney.destination_name}
          alertRadiusKm={activeJourney.configured_alert_distance}
          routeWaypoints={activeRouteWaypoints}
          isDeadReckoning={liveState.deadReckoningActive}
          isAlerting={activeJourney.journey_status === 'alerting'}
          className="h-52 w-full"
          zoom={12}
        />

        {/* Telemetry 2x2 Grid */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Distance Left</span>
              <Compass className="h-3.5 w-3.5 text-cyan-400" />
            </div>
            <p className="font-mono-num mt-1 text-2xl font-extrabold text-white">
              {liveState.distanceKm.toFixed(2)}{' '}
              <span className="text-xs font-semibold text-slate-400">km</span>
            </p>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Alert @ {activeJourney.configured_alert_distance.toFixed(1)} km radius
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Speed &amp; ETA</span>
              <Gauge className="h-3.5 w-3.5 text-blue-400" />
            </div>
            <p className="font-mono-num mt-1 text-2xl font-extrabold text-white">
              {Math.round(liveState.speedKmh)}{' '}
              <span className="text-xs font-semibold text-slate-400">km/h</span>
            </p>
            <p className="mt-0.5 text-[10px] text-cyan-300">
              {liveState.etaMinutes !== null ? `ETA ~${liveState.etaMinutes} min` : 'Calculating ETA'}
            </p>
          </div>
        </div>

        {/* Next Stop + Adaptive Battery Savings Bar */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/75 px-3.5 py-2.5 text-xs">
          <div className="flex items-center gap-2 truncate">
            <TrainFront className="h-4 w-4 shrink-0 text-cyan-400" />
            <span className="truncate text-slate-300">
              Next: <strong className="text-white">{liveState.nextStationName || activeJourney.destination_name}</strong>
              {liveState.remainingStopsCount > 0 ? ` (${liveState.remainingStopsCount} stops)` : ''}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
            <BatteryCharging className="h-3.5 w-3.5" />
            {batterySaved}% saved
          </div>
        </div>

        {/* Live Radius Adjuster */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Alert Radius Threshold</span>
            <span className="font-mono-num font-bold text-cyan-300">
              {activeJourney.configured_alert_distance.toFixed(1)} km
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={activeJourney.configured_alert_distance}
            onChange={(e) => onUpdateAlertRadius(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
        </div>

        {/* Judge / Field Simulation Controls (Collapsible) */}
        <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-3.5">
          <button
            type="button"
            onClick={() => setShowDemoControls((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="inline-flex items-center gap-2 text-xs font-bold text-cyan-300">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Judge Demo &amp; Fallback Controls
            </span>
            {showDemoControls ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showDemoControls && (
            <div className="mt-3 space-y-2.5 border-t border-slate-800 pt-3">
              {activeJourney.mode === 'simulator' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-slate-400">Sim Speed:</span>
                  <div className="flex gap-1.5">
                    {[1, 5, 15, 30].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => onChangeSimSpeed(spd)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                          liveState.simSpeedMultiplier === spd
                            ? 'bg-cyan-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {!liveState.deadReckoningActive ? (
                  <button
                    type="button"
                    onClick={onSimulateSignalDrop}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 py-2.5 text-xs font-bold text-amber-300 transition active:scale-95"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Drop Signal / Net
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRestoreSignal}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/20 py-2.5 text-xs font-bold text-emerald-300 transition active:scale-95"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    Restore Signal
                  </button>
                )}

                <button
                  type="button"
                  onClick={onJumpNearAlert}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs font-bold text-slate-200 transition active:scale-95"
                >
                  <Activity className="h-3.5 w-3.5 text-cyan-400" />
                  Jump Near Stop
                </button>
              </div>

              <button
                type="button"
                onClick={onForceTestAlarm}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/35 bg-rose-500/15 py-2 text-xs font-bold text-rose-300 transition active:scale-95"
              >
                <Bell className="h-3.5 w-3.5" />
                Trigger Approach Alarm Now
              </button>
            </div>
          )}
        </div>

        {/* Pause / Stop Actions */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onPauseResume}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-900 py-3.5 text-xs font-bold text-white transition active:scale-95"
          >
            {activeJourney.journey_status === 'paused' ? (
              <>
                <Play className="h-4 w-4 text-emerald-400" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 text-amber-400" />
                Pause
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onStopJourney}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/15 py-3.5 text-xs font-bold text-rose-300 transition active:scale-95"
          >
            <Square className="h-4 w-4 fill-rose-400" />
            End Journey
          </button>
        </div>
      </div>
    );
  }

  // ==============================================================
  // PRE-JOURNEY CONFIGURATION VIEW
  // ==============================================================
  return (
    <div className="space-y-4 pb-28">
      <header className="pt-1">
        <h1 className="text-lg font-extrabold text-white">Configure Journey (FR-05)</h1>
        <p className="text-xs text-slate-400">
          Choose Mumbai Local Simulator for indoor judge demo, or Live Device GPS outdoors.
        </p>
      </header>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-1.5">
        <button
          type="button"
          onClick={() => setMode('simulator')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
            mode === 'simulator'
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrainFront className="h-4 w-4" />
          Mumbai Simulator
        </button>
        <button
          type="button"
          onClick={() => setMode('live_gps')}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold transition ${
            mode === 'live_gps'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 shadow'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Satellite className="h-4 w-4" />
          Live Phone GPS
        </button>
      </div>

      {/* Route / Origin & Destination */}
      <div className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        {mode === 'simulator' ? (
          <>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setSimSourceType('preset')}
                className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                  simSourceType === 'preset' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
                }`}
              >
                Local Corridor
              </button>
              <button
                type="button"
                onClick={() => setSimSourceType('custom')}
                className={`rounded-lg py-1.5 text-[11px] font-bold transition ${
                  simSourceType === 'custom' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400'
                }`}
              >
                Custom Start → Stop
              </button>
            </div>

            {simSourceType === 'preset' ? (
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-300">
                  Mumbai Local Preset Corridor
                </label>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs font-medium text-white outline-none focus:border-cyan-500"
                >
                  {MUMBAI_PRESET_ROUTES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} (~{r.avgSpeedKmh} km/h)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Starting Station
                  </label>
                  <select
                    value={originStationId}
                    onChange={(e) => setOriginStationId(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    {MUMBAI_STATIONS.filter((s) => s.isMajor).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-300">
                    Destination
                  </label>
                  <select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    {destinations.map((d) => (
                      <option key={d.destination_id} value={d.destination_id}>
                        {d.destination_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div>
                <p className="text-xs font-bold text-white">Starting Point (FR-04)</p>
                <p className="font-mono-num text-[11px] text-slate-400">
                  {capturedGps
                    ? `${capturedGps.lat.toFixed(5)}, ${capturedGps.lng.toFixed(5)}`
                    : 'Not captured yet (will auto-lock on start)'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCaptureGps}
                disabled={gpsLoading}
                className="rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30"
              >
                {gpsLoading ? 'Locking...' : 'Capture GPS'}
              </button>
            </div>
            {gpsError && (
              <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {gpsError}
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-300">
                Target Saved Destination
              </label>
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500"
              >
                {destinations.map((d) => (
                  <option key={d.destination_id} value={d.destination_id}>
                    {d.destination_name} ({d.line})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Alert Distance Radius */}
        <div className="border-t border-slate-800 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">Alert Distance Threshold</span>
            <span className="font-mono-num rounded-lg bg-cyan-500/15 px-2 py-0.5 font-bold text-cyan-300">
              {alertRadiusKm.toFixed(1)} km before stop
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={alertRadiusKm}
            onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
            className="w-full accent-cyan-400"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-500">
            <span>0.5 km (Tight)</span>
            <span>2.0 km (Mumbai Local Ideal)</span>
            <span>10 km (Outstation)</span>
          </div>
        </div>

        {/* Dead-Reckoning Stops Buffer */}
        <div className="border-t border-slate-800 pt-3">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300">
              Expected Stops (Dead-Reckoning Buffer)
            </span>
            <span className="font-mono-num font-bold text-amber-300">
              {expectedStops} stops (+{(expectedStops * preferences.stopBufferMinutesPerStop).toFixed(1)}m)
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={8}
            step={1}
            value={expectedStops}
            onChange={(e) => setExpectedStops(Number(e.target.value))}
            className="w-full accent-amber-400"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            If internet/GPS drops in a tunnel or low-signal area, WakeMe uses distance + speed + stops to trigger an estimated fallback alert.
          </p>
        </div>

        {previewDistKm !== null && (
          <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2 text-[11px]">
            <span className="text-slate-400">Estimated Corridor Distance</span>
            <span className="font-mono-num font-bold text-white">{previewDistKm.toFixed(1)} km</span>
          </div>
        )}
      </div>

      {/* Start Button */}
      <button
        type="button"
        onClick={handleLaunch}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 via-cyan-500 to-blue-600 py-4 text-sm font-extrabold text-slate-950 shadow-xl shadow-cyan-500/25 transition active:scale-[0.98]"
      >
        <Navigation className="h-4 w-4" />
        Start Journey &amp; Arm WakeMe
      </button>
    </div>
  );
};
