import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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

  useEffect(() => {
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
          subtitle: preset.title,
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
  // ACTIVE JOURNEY LIVE HUD
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
        ? 'border-rose-400/40 bg-rose-500/15 text-rose-200'
        : liveState.pollingZone === 'ZONE_2_BALANCED'
        ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-200'
        : 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200';

    // Determine visible stepper stops slice
    const totalStops = activeRouteWaypoints.length;
    const currentStopIdx =
      totalStops > 1
        ? Math.min(totalStops - 1, Math.floor(liveState.simProgress * (totalStops - 1)))
        : 0;

    return (
      <div className="space-y-4">
        {/* Route Heading & Polling Zone */}
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{activeJourney.mode === 'simulator' ? 'Mumbai Local Sim' : 'Live GPS'}</span>
              <span>·</span>
              <span>Alert at {activeJourney.configured_alert_distance.toFixed(1)} km</span>
            </div>
            <h1 className="mt-1 truncate text-lg font-bold tracking-[-0.02em] text-white">
              {activeJourney.start_location_name} to {activeJourney.destination_name}
            </h1>
          </div>

          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${zoneBadgeColor}`}>
            {liveState.pollingZone === 'ZONE_1_ECO'
              ? 'Eco 60s'
              : liveState.pollingZone === 'ZONE_2_BALANCED'
              ? 'Balanced 20s'
              : 'Precision 3s'}
          </span>
        </header>

        {/* Connection Health / Dead-Reckoning Fallback Strip */}
        {liveState.deadReckoningActive ? (
          <div className="rounded-2xl border border-amber-400/45 bg-amber-500/15 p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-amber-300" />
                <div>
                  <p className="text-xs font-bold text-amber-200">
                    Signal Lost — Dead-Reckoning Active
                  </p>
                  <p className="mt-0.5 text-xs text-amber-100/85">
                    Locked at {liveState.drSnapshotDistanceKm?.toFixed(2)} km ·{' '}
                    {Math.round(liveState.drSnapshotSpeedKmh || 0)} km/h ·{' '}
                    {liveState.drStopsBufferCount} stops buffer
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-amber-200/80">Est. Alert</p>
                <p className="font-mono-num text-lg font-bold text-white">
                  {formatDurationCompact(liveState.drRemainingSec)}
                </p>
              </div>
            </div>
          </div>
        ) : liveState.recalibrationNotice ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-400/45 bg-emerald-500/15 px-3.5 py-3">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
            <p className="text-xs font-semibold text-emerald-100">{liveState.recalibrationNotice}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#0e1524] px-3.5 py-2.5 text-xs">
            <span className="inline-flex items-center gap-2 font-medium text-slate-200">
              <Satellite className="h-4 w-4 text-emerald-400" />
              Signal healthy · Live GPS proximity
            </span>
            <span className="font-mono-num text-slate-400">±{Math.round(liveState.accuracyMeters)}m</span>
          </div>
        )}

        {/* Unified Telemetry Strip */}
        <div className="grid grid-cols-3 divide-x divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-[#0e1524]">
          <div className="p-3.5">
            <p className="text-[11px] font-medium text-slate-400">Distance</p>
            <p className="font-mono-num mt-1 text-xl font-bold text-white">
              {liveState.distanceKm.toFixed(2)}
              <span className="ml-1 text-xs font-medium text-slate-400">km</span>
            </p>
          </div>
          <div className="p-3.5">
            <p className="text-[11px] font-medium text-slate-400">Speed</p>
            <p className="font-mono-num mt-1 text-xl font-bold text-white">
              {Math.round(liveState.speedKmh)}
              <span className="ml-1 text-xs font-medium text-slate-400">km/h</span>
            </p>
          </div>
          <div className="p-3.5">
            <p className="text-[11px] font-medium text-slate-400">ETA</p>
            <p className="font-mono-num mt-1 text-xl font-bold text-cyan-300">
              {liveState.etaMinutes !== null ? `${liveState.etaMinutes}m` : '--'}
            </p>
          </div>
        </div>

        {/* Mumbai Local Live Route Stepper */}
        {activeRouteWaypoints.length >= 2 && (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-200">
                <TrainFront className="h-4 w-4 text-cyan-300" />
                Next: {liveState.nextStationName || activeJourney.destination_name}
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold">
                <BatteryCharging className="h-3.5 w-3.5" />
                {batterySaved}% saved
              </span>
            </div>

            <div className="clean-scroll flex items-center gap-1.5 overflow-x-auto pb-1">
              {activeRouteWaypoints.map((wp, idx) => {
                const isLast = idx === activeRouteWaypoints.length - 1;
                const isPassed = idx < currentStopIdx;
                const isCurrent = idx === currentStopIdx;
                return (
                  <React.Fragment key={`${wp.name}-${idx}`}>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <span
                        className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${
                          isLast
                            ? 'border-cyan-300 bg-cyan-400/30'
                            : isCurrent
                            ? 'border-emerald-300 bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]'
                            : isPassed
                            ? 'border-slate-600 bg-slate-600'
                            : 'border-slate-500 bg-[#05070b]'
                        }`}
                      />
                      <span
                        className={`max-w-[74px] truncate text-[10px] font-medium ${
                          isLast
                            ? 'font-bold text-cyan-300'
                            : isCurrent
                            ? 'font-semibold text-emerald-300'
                            : isPassed
                            ? 'text-slate-500'
                            : 'text-slate-300'
                        }`}
                      >
                        {wp.name.replace(' (Central)', '').replace(' (Western)', '')}
                      </span>
                    </div>
                    {!isLast && (
                      <div
                        className={`mb-4 h-0.5 w-6 shrink-0 rounded-full ${
                          isPassed ? 'bg-emerald-500/60' : 'bg-white/10'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Alert Radius Adjuster */}
        <div className="rounded-2xl border border-white/[0.08] bg-[#0e1524] p-3.5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Alert radius threshold</span>
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

        {/* Judge / Field Simulation Controls */}
        <div className="rounded-2xl border border-cyan-400/25 bg-[#0e1524] p-3.5">
          <button
            type="button"
            onClick={() => setShowDemoControls((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-200">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Judge demo &amp; signal controls
            </span>
            {showDemoControls ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showDemoControls && (
            <div className="mt-3 space-y-2.5 border-t border-white/[0.07] pt-3">
              {activeJourney.mode === 'simulator' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">Sim speed</span>
                  <div className="flex gap-1.5">
                    {[1, 5, 15, 30].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => onChangeSimSpeed(spd)}
                        className={`pressable rounded-lg px-2.5 py-1 text-xs font-semibold ${
                          liveState.simSpeedMultiplier === spd
                            ? 'bg-cyan-400 text-slate-950'
                            : 'bg-white/[0.07] text-slate-300 hover:bg-white/10'
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
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-400/35 bg-amber-500/15 py-2.5 text-xs font-semibold text-amber-200"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Drop Signal / Net
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRestoreSignal}
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/35 bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-200"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    Restore Signal
                  </button>
                )}

                <button
                  type="button"
                  onClick={onJumpNearAlert}
                  className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
                >
                  <Activity className="h-3.5 w-3.5 text-cyan-300" />
                  Jump Near Stop
                </button>
              </div>

              <button
                type="button"
                onClick={onForceTestAlarm}
                className="pressable flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 bg-rose-500/15 py-2.5 text-xs font-semibold text-rose-200"
              >
                <Bell className="h-3.5 w-3.5" />
                Trigger Approach Alarm Now
              </button>
            </div>
          )}
        </div>

        {/* Pause / End */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={onPauseResume}
            className="pressable inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#0e1524] py-3.5 text-xs font-bold text-white"
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
            className="pressable inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-400/35 bg-rose-500/15 py-3.5 text-xs font-bold text-rose-200"
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
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-[-0.025em] text-white">Configure journey</h1>
        <p className="mt-1 text-xs text-slate-400">
          Run the Mumbai Local simulator indoors for demos, or arm live phone GPS outdoors.
        </p>
      </header>

      {/* Mode Segmented Control */}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.08] bg-[#0e1524] p-1.5">
        <button
          type="button"
          onClick={() => setMode('simulator')}
          className={`pressable flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold ${
            mode === 'simulator'
              ? 'bg-cyan-400 text-slate-950'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <TrainFront className="h-4 w-4" />
          Mumbai Simulator
        </button>
        <button
          type="button"
          onClick={() => setMode('live_gps')}
          className={`pressable flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold ${
            mode === 'live_gps'
              ? 'bg-emerald-400 text-slate-950'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Satellite className="h-4 w-4" />
          Live Phone GPS
        </button>
      </div>

      {/* Config Panel */}
      <div className="space-y-4 rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
        {mode === 'simulator' ? (
          <>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#05070b] p-1">
              <button
                type="button"
                onClick={() => setSimSourceType('preset')}
                className={`pressable rounded-lg py-2 text-xs font-semibold ${
                  simSourceType === 'preset' ? 'bg-[#141e33] text-cyan-300' : 'text-slate-400'
                }`}
              >
                Local Corridor
              </button>
              <button
                type="button"
                onClick={() => setSimSourceType('custom')}
                className={`pressable rounded-lg py-2 text-xs font-semibold ${
                  simSourceType === 'custom' ? 'bg-[#141e33] text-cyan-300' : 'text-slate-400'
                }`}
              >
                Custom Start to Stop
              </button>
            </div>

            {simSourceType === 'preset' ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Mumbai Local corridor
                </label>
                <select
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
                >
                  {MUMBAI_PRESET_ROUTES.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} (~{r.avgSpeedKmh} km/h)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">
                    Starting station
                  </label>
                  <select
                    value={originStationId}
                    onChange={(e) => setOriginStationId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/60"
                  >
                    {MUMBAI_STATIONS.filter((s) => s.isMajor).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-300">
                    Destination
                  </label>
                  <select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-400/60"
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
            <div className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#05070b] p-3">
              <div>
                <p className="text-xs font-semibold text-white">Starting GPS fix</p>
                <p className="font-mono-num mt-0.5 text-[11px] text-slate-400">
                  {capturedGps
                    ? `${capturedGps.lat.toFixed(5)}, ${capturedGps.lng.toFixed(5)}`
                    : 'Auto-locks when armed'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCaptureGps}
                disabled={gpsLoading}
                className="pressable rounded-xl bg-emerald-400/20 px-3 py-2 text-xs font-bold text-emerald-300"
              >
                {gpsLoading ? 'Locking…' : 'Capture GPS'}
              </button>
            </div>
            {gpsError && (
              <p className="flex items-center gap-1.5 text-xs text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {gpsError}
              </p>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Target saved destination
              </label>
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-400/60"
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

        {/* Alert Threshold */}
        <div className="border-t border-white/[0.07] pt-3.5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Alert distance threshold</span>
            <span className="font-mono-num rounded-lg bg-cyan-400/15 px-2 py-0.5 font-bold text-cyan-300">
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
        </div>

        {/* Dead-Reckoning Buffer */}
        <div className="border-t border-white/[0.07] pt-3.5">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-300">Expected stops buffer</span>
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
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            Used for Dead-Reckoning ETA fallback if internet or GPS drops mid-journey.
          </p>
        </div>

        {previewDistKm !== null && (
          <div className="flex items-center justify-between rounded-xl bg-[#05070b] px-3.5 py-2.5 text-xs">
            <span className="text-slate-400">Estimated corridor distance</span>
            <span className="font-mono-num font-bold text-white">{previewDistKm.toFixed(1)} km</span>
          </div>
        )}
      </div>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={handleLaunch}
        className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 py-4 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-300"
      >
        <Navigation className="h-4 w-4" />
        Start Journey &amp; Arm WakeMe
      </button>
    </div>
  );
};
