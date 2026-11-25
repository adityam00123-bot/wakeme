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
  theme: 'light' | 'dark';
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
  theme,
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
  const [expectedStops, setExpectedStops] = useState<number>(4);
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
      const isLong = selectedDestination.line === 'Express' || selectedDestination.line === 'Bus';
      setAlertRadiusKm(isLong ? 5.0 : 2.0);
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
          destination_name: `${endSt.name}`,
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
      startName: capturedGps ? 'Current Device GPS' : 'Current Location',
      startLat,
      startLng,
      alertRadiusKm,
      expectedStops,
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

    const zoneBadgeColor =
      liveState.pollingZone === 'ZONE_3_HIGH'
        ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-400/40 dark:bg-rose-500/15 dark:text-rose-200'
        : liveState.pollingZone === 'ZONE_2_BALANCED'
        ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-blue-200'
        : 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-200';

    const totalStops = activeRouteWaypoints.length;
    const currentStopIdx =
      totalStops > 1
        ? Math.min(totalStops - 1, Math.floor(liveState.simProgress * (totalStops - 1)))
        : 0;

    return (
      <div className="space-y-4">
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{activeJourney.mode === 'simulator' ? 'Route Simulator' : 'Live GPS'}</span>
              <span>·</span>
              <span>Alert @ {activeJourney.configured_alert_distance.toFixed(1)} km</span>
            </div>
            <h1 className="mt-0.5 truncate text-lg font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
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

        {/* Connection / Dead-Reckoning Strip */}
        {liveState.deadReckoningActive ? (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-400/45 dark:bg-amber-500/15">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-amber-600 dark:text-amber-300" />
                <div>
                  <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Signal Lost — Dead-Reckoning Active
                  </p>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-100/85">
                    Locked @ {liveState.drSnapshotDistanceKm?.toFixed(2)} km ·{' '}
                    {Math.round(liveState.drSnapshotSpeedKmh || 0)} km/h ·{' '}
                    {liveState.drStopsBufferCount} stops
                  </p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] text-amber-700 dark:text-amber-200/80">Est. Alert</p>
                <p className="font-mono-num text-lg font-bold text-amber-950 dark:text-white">
                  {formatDurationCompact(liveState.drRemainingSec)}
                </p>
              </div>
            </div>
          </div>
        ) : liveState.recalibrationNotice ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-3.5 py-3 dark:border-emerald-400/45 dark:bg-emerald-500/15">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
            <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              {liveState.recalibrationNotice}
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs shadow-xs dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
            <span className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
              <Satellite className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Signal healthy · Live GPS proximity
            </span>
            <span className="font-mono-num text-slate-500 dark:text-slate-400">
              ±{Math.round(liveState.accuracyMeters)}m
            </span>
          </div>
        )}

        {/* MapLibre OpenFreeMap Vector Map */}
        <LiveMap
          theme={theme}
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
          zoom={9}
        />

        {/* Unified Telemetry Strip */}
        <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-white/[0.07] dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
          <div className="p-3.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Distance</p>
            <p className="font-mono-num mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {liveState.distanceKm.toFixed(1)}
              <span className="ml-1 text-xs font-medium text-slate-400">km</span>
            </p>
          </div>
          <div className="p-3.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Speed</p>
            <p className="font-mono-num mt-1 text-xl font-bold text-slate-900 dark:text-white">
              {Math.round(liveState.speedKmh)}
              <span className="ml-1 text-xs font-medium text-slate-400">km/h</span>
            </p>
          </div>
          <div className="p-3.5">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">ETA</p>
            <p className="font-mono-num mt-1 text-xl font-bold text-blue-600 dark:text-blue-400">
              {liveState.etaMinutes !== null ? formatDurationCompact(liveState.etaMinutes * 60) : '--'}
            </p>
          </div>
        </div>

        {/* Station Stepper */}
        {activeRouteWaypoints.length >= 2 && (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                <TrainFront className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                Next: {liveState.nextStationName || activeJourney.destination_name}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
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
                            ? 'border-blue-600 bg-blue-100 dark:border-blue-400 dark:bg-blue-400/30'
                            : isCurrent
                            ? 'border-emerald-500 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                            : isPassed
                            ? 'border-slate-400 bg-slate-400 dark:border-slate-600 dark:bg-slate-600'
                            : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-[#0a0d12]'
                        }`}
                      />
                      <span
                        className={`max-w-[78px] truncate text-[10px] font-medium ${
                          isLast
                            ? 'font-bold text-blue-600 dark:text-blue-400'
                            : isCurrent
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : isPassed
                            ? 'text-slate-400 dark:text-slate-500'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {wp.name.replace(' (Central)', '').replace(' (Western)', '')}
                      </span>
                    </div>
                    {!isLast && (
                      <div
                        className={`mb-4 h-0.5 w-6 shrink-0 rounded-full ${
                          isPassed ? 'bg-emerald-500/60' : 'bg-slate-200 dark:bg-white/10'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Alert Radius Slider */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">Alert radius threshold</span>
            <span className="font-mono-num font-bold text-blue-600 dark:text-blue-400">
              {activeJourney.configured_alert_distance.toFixed(1)} km
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={activeJourney.configured_alert_distance}
            onChange={(e) => onUpdateAlertRadius(Number(e.target.value))}
            className="w-full accent-blue-600 dark:accent-blue-500"
          />
        </div>

        {/* Judge Demo & Signal Controls */}
        <div className="rounded-2xl border border-blue-200 bg-white p-3.5 shadow-sm dark:border-blue-500/25 dark:bg-[#141923] dark:shadow-none">
          <button
            type="button"
            onClick={() => setShowDemoControls((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
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
            <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-white/[0.07]">
              {activeJourney.mode === 'simulator' && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Sim speed</span>
                  <div className="flex gap-1.5">
                    {[1, 10, 30, 60].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => onChangeSimSpeed(spd)}
                        className={`pressable rounded-lg px-2.5 py-1 text-xs font-semibold ${
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

              <div className="grid grid-cols-2 gap-2">
                {!liveState.deadReckoningActive ? (
                  <button
                    type="button"
                    onClick={onSimulateSignalDrop}
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-400/35 dark:bg-amber-500/15 dark:text-amber-200"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Drop Signal / Net
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onRestoreSignal}
                    className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 py-2.5 text-xs font-semibold text-emerald-800 dark:border-emerald-400/35 dark:bg-emerald-500/20 dark:text-emerald-200"
                  >
                    <Radio className="h-3.5 w-3.5" />
                    Restore Signal
                  </button>
                )}

                <button
                  type="button"
                  onClick={onJumpNearAlert}
                  className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-[#edf1f7] py-2.5 text-xs font-semibold text-slate-800 dark:border-white/10 dark:bg-[#1c2331] dark:text-slate-200"
                >
                  <Activity className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  Jump Near Stop
                </button>
              </div>

              <button
                type="button"
                onClick={onForceTestAlarm}
                className="pressable flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/15 dark:text-rose-200"
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
            className="pressable inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-3.5 text-xs font-bold text-slate-800 shadow-xs dark:border-white/10 dark:bg-[#141923] dark:text-white"
          >
            {activeJourney.journey_status === 'paused' ? (
              <>
                <Play className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                Resume
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
      </div>
    );
  }

  // ==============================================================
  // PRE-TRIP CONFIGURATION VIEW
  // ==============================================================
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold tracking-[-0.025em] text-slate-900 dark:text-white">
          Set up your trip
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Choose a preset route to simulate indoors, or arm Live Phone GPS outdoors.
        </p>
      </header>

      {/* Mode Switch */}
      <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-slate-200 bg-[#edf1f7] p-1.5 dark:border-white/[0.08] dark:bg-[#141923]">
        <button
          type="button"
          onClick={() => setMode('simulator')}
          className={`pressable flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold ${
            mode === 'simulator'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <TrainFront className="h-4 w-4" />
          Route Simulator
        </button>
        <button
          type="button"
          onClick={() => setMode('live_gps')}
          className={`pressable flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold ${
            mode === 'live_gps'
              ? 'bg-white text-slate-900 shadow-xs dark:bg-emerald-600 dark:text-white'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Satellite className="h-4 w-4" />
          Live Phone GPS
        </button>
      </div>

      {/* Config Form */}
      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        {mode === 'simulator' ? (
          <>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-[#edf1f7] p-1 dark:bg-[#0a0d12]">
              <button
                type="button"
                onClick={() => setSimSourceType('preset')}
                className={`pressable rounded-lg py-2 text-xs font-semibold ${
                  simSourceType === 'preset'
                    ? 'bg-white text-blue-600 shadow-xs dark:bg-[#1c2331] dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Preset Corridors
              </button>
              <button
                type="button"
                onClick={() => setSimSourceType('custom')}
                className={`pressable rounded-lg py-2 text-xs font-semibold ${
                  simSourceType === 'custom'
                    ? 'bg-white text-blue-600 shadow-xs dark:bg-[#1c2331] dark:text-blue-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                Custom Start to Stop
              </button>
            </div>

            {simSourceType === 'preset' ? (
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Long-Distance &amp; Mumbai Local routes
                </label>
                <select
                  value={routeId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setRouteId(nextId);
                    const found = MUMBAI_PRESET_ROUTES.find((r) => r.id === nextId);
                    if (found) setAlertRadiusKm(found.defaultAlertKm);
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
                >
                  <optgroup label="Long-Distance Trains & Overnight Buses">
                    {MUMBAI_PRESET_ROUTES.filter((r) => r.scope === 'long_distance').map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Mumbai Local Corridors">
                    {MUMBAI_PRESET_ROUTES.filter((r) => r.scope === 'local').map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.title}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Starting stop
                  </label>
                  <select
                    value={originStationId}
                    onChange={(e) => setOriginStationId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
                  >
                    {MUMBAI_STATIONS.filter((s) => s.isMajor).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                    Destination
                  </label>
                  <select
                    value={destId}
                    onChange={(e) => setDestId(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
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
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-[#f5f7fa] p-3 dark:border-white/10 dark:bg-[#0a0d12]">
              <div>
                <p className="text-xs font-semibold text-slate-900 dark:text-white">Starting GPS fix</p>
                <p className="font-mono-num mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  {capturedGps
                    ? `${capturedGps.lat.toFixed(5)}, ${capturedGps.lng.toFixed(5)}`
                    : 'Auto-locks when armed'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCaptureGps}
                disabled={gpsLoading}
                className="pressable rounded-xl bg-emerald-600/15 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
              >
                {gpsLoading ? 'Locking…' : 'Capture GPS'}
              </button>
            </div>
            {gpsError && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {gpsError}
              </p>
            )}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Target saved destination
              </label>
              <select
                value={destId}
                onChange={(e) => setDestId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
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

        {/* Alert Threshold */}
        <div className="border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              Alert distance threshold
            </span>
            <span className="font-mono-num rounded-lg bg-blue-50 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {alertRadiusKm.toFixed(1)} km before stop
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={15}
            step={0.5}
            value={alertRadiusKm}
            onChange={(e) => setAlertRadiusKm(Number(e.target.value))}
            className="w-full accent-blue-600 dark:accent-blue-500"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>1–2 km (Local)</span>
            <span>5–8 km (Express)</span>
            <span>15 km (Early)</span>
          </div>
        </div>

        {/* Dead-Reckoning Stops Buffer */}
        <div className="border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-300">
              Expected stops buffer
            </span>
            <span className="font-mono-num font-bold text-amber-600 dark:text-amber-300">
              {expectedStops} stops (+{(expectedStops * preferences.stopBufferMinutesPerStop).toFixed(1)}m)
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={expectedStops}
            onChange={(e) => setExpectedStops(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Used for Dead-Reckoning fallback ETA if internet or GPS drops in tunnels.
          </p>
        </div>

        {previewDistKm !== null && (
          <div className="flex items-center justify-between rounded-xl bg-[#f5f7fa] px-3.5 py-2.5 text-xs dark:bg-[#0a0d12]">
            <span className="text-slate-500 dark:text-slate-400">Estimated route distance</span>
            <span className="font-mono-num font-bold text-slate-900 dark:text-white">
              {previewDistKm.toFixed(1)} km
            </span>
          </div>
        )}
      </div>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={handleLaunch}
        className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-4 text-sm font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
      >
        <Navigation className="h-4 w-4" />
        Start Trip &amp; Arm WakeMe
      </button>
    </div>
  );
};
