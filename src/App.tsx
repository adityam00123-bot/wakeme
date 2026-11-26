import React, { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import {
  Compass,
  Home,
  Moon,
  Navigation,
  Radio,
  Search,
  Settings,
  Sun,
  User,
  WifiOff,
} from 'lucide-react';
import { AddDestinationScreen } from './components/AddDestinationScreen';
import { AlarmOverlay } from './components/AlarmOverlay';
import { AuthModal } from './components/AuthModal';
import { HomeScreen } from './components/HomeScreen';
import { JourneyScreen, StartJourneyConfig } from './components/JourneyScreen';
import { LaunchSplashIntro } from './components/LaunchSplashIntro';
import { SettingsTelemetryScreen } from './components/SettingsTelemetryScreen';
import { StartupPermissionsModal } from './components/StartupPermissionsModal';
import { DEFAULT_DESTINATIONS, MUMBAI_PRESET_ROUTES, getStationById } from './data/mumbaiLocal';
import { alertEngine } from './services/alertEngine';
import {
  buildRouteWaypoints,
  computeDeadReckoningEtaSec,
  computeRouteProgress,
  getPollingZoneInfo,
  haversineDistanceKm,
  interpolateStations,
} from './services/geoEngine';
import {
  getCurrentPositionUnified,
  isGeoAvailable,
  watchPositionUnified,
} from './services/nativeGeo';
import {
  StartupPermissionReadiness,
  checkStartupPermissionReadiness,
  setNativeAlarmScreenMode,
} from './services/nativePermissions';
import {
  DEFAULT_PREFERENCES,
  loadDestinations,
  loadJourneys,
  loadTelemetryLogs,
  loadUserProfile,
  saveDestinations,
  saveJourneys,
  saveTelemetryLogs,
  saveUserProfile,
  syncRecordToSupabase,
} from './services/storage';
import {
  Destination,
  JourneyRecord,
  LiveTrackingState,
  MumbaiPresetRoute,
  RouteWaypoint,
  TelemetryLogEntry,
  UserPreferences,
  UserProfile,
} from './types/wakeme';

type TabKey = 'home' | 'add' | 'journey' | 'settings';

function computeLiveEtaMinutes(
  distanceKm: number,
  liveSpeedKmh: number,
  baselineSpeedKmh: number
): number {
  const effectiveSpeed = liveSpeedKmh >= 6 ? liveSpeedKmh : Math.max(baselineSpeedKmh, 32);
  return Math.max(1, Math.round((distanceKm / effectiveSpeed) * 60));
}

export function App() {
  const [tab, setTab] = useState<TabKey>('home');
  const [user, setUser] = useState<UserProfile>(() => loadUserProfile());
  const [destinations, setDestinations] = useState<Destination[]>(() => loadDestinations());
  const [journeys, setJourneys] = useState<JourneyRecord[]>(() => loadJourneys());
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLogEntry[]>(() => loadTelemetryLogs());
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [selectedPresetRoute, setSelectedPresetRoute] = useState<MumbaiPresetRoute | null>(null);

  const [activeJourney, setActiveJourney] = useState<JourneyRecord | null>(null);
  const [liveState, setLiveState] = useState<LiveTrackingState | null>(null);
  const [showLaunchIntro, setShowLaunchIntro] = useState(true);
  const [startupPermsOpen, setStartupPermsOpen] = useState(false);
  const [permReadiness, setPermReadiness] = useState<StartupPermissionReadiness | null>(null);

  const activeJourneyRef = useRef<JourneyRecord | null>(null);
  const liveStateRef = useRef<LiveTrackingState | null>(null);
  const userRef = useRef<UserProfile>(user);
  const tabRef = useRef<TabKey>(tab);
  const authModalOpenRef = useRef<boolean>(authModalOpen);
  const startupPermsOpenRef = useRef<boolean>(startupPermsOpen);
  const gpsWatchCleanupRef = useRef<(() => void) | null>(null);
  const gpsSessionTokenRef = useRef(0);
  const simWaypointsRef = useRef<RouteWaypoint[]>([]);
  const prevGpsFixRef = useRef<{ lat: number; lng: number; timeMs: number } | null>(null);
  const snoozeUntilRef = useRef<number>(0);
  const routeBaselineSpeedRef = useRef<number>(58);
  const testAlarmTimerRef = useRef<number | null>(null);
  const recalibrateTimerRef = useRef<number | null>(null);
  const lastTickMsRef = useRef<number>(Date.now());
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  } | null>(null);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(
        e as unknown as {
          prompt: () => Promise<void>;
          userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
        }
      );
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  activeJourneyRef.current = activeJourney;
  liveStateRef.current = liveState;
  userRef.current = user;
  tabRef.current = tab;
  authModalOpenRef.current = authModalOpen;
  startupPermsOpenRef.current = startupPermsOpen;

  // Silent startup readiness probe during splash intro
  useEffect(() => {
    void checkStartupPermissionReadiness().then(setPermReadiness);
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowLaunchIntro(false);
    if (!Capacitor.isNativePlatform()) return;
    void checkStartupPermissionReadiness().then((status) => {
      setPermReadiness(status);
      if (!status.allCriticalReady) {
        setStartupPermsOpen(true);
      }
    });
  }, []);

  // Handle Android hardware / gesture Back button cleanly in APK
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listenerPromise = CapApp.addListener('backButton', ({ canGoBack }) => {
      if (activeJourneyRef.current?.journey_status === 'alerting') {
        return; // Require alarm snooze/dismiss slide rather than accidental Back exit
      }
      if (startupPermsOpenRef.current) {
        setStartupPermsOpen(false);
        return;
      }
      if (authModalOpenRef.current) {
        setAuthModalOpen(false);
        return;
      }
      if (tabRef.current !== 'home') {
        setTab('home');
        return;
      }
      if (canGoBack) {
        window.history.back();
      } else {
        void CapApp.minimizeApp();
      }
    });
    return () => {
      void listenerPromise.then((handle) => handle.remove());
    };
  }, []);

  // Apply Light / Dark theme class, meta theme-color, & native SystemBars style
  useEffect(() => {
    const isDark = user.preferences.theme === 'dark';
    document.documentElement.classList.toggle('dark', isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#0A0D12' : '#F5F7FA');
    }
    if (Capacitor.isNativePlatform()) {
      void SystemBars.setStyle({
        style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      }).catch(() => {});
    }
  }, [user.preferences.theme]);

  const appendLog = useCallback((type: TelemetryLogEntry['type'], message: string) => {
    const entry: TelemetryLogEntry = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
    };
    setTelemetryLogs((prev) => {
      const next = [entry, ...prev].slice(0, 80);
      saveTelemetryLogs(next);
      return next;
    });
  }, []);

  const handleSaveUser = (updated: UserProfile) => {
    setUser(updated);
    saveUserProfile(updated);
  };

  const handleUpdatePreferences = (updatedPrefs: UserPreferences) => {
    const next = { ...user, preferences: updatedPrefs };
    setUser(next);
    saveUserProfile(next);
  };

  const toggleThemeQuick = () => {
    handleUpdatePreferences({
      ...user.preferences,
      theme: user.preferences.theme === 'dark' ? 'light' : 'dark',
    });
  };

  const handleToggleFavourite = (id: string) => {
    const next = destinations.map((d) =>
      d.destination_id === id ? { ...d, favourite_status: !d.favourite_status } : d
    );
    setDestinations(next);
    saveDestinations(next);
  };

  const handleDeleteDestination = (id: string) => {
    const next = destinations.filter((d) => d.destination_id !== id);
    setDestinations(next);
    saveDestinations(next);
  };

  const handleRenameDestination = (id: string, newName: string) => {
    const next = destinations.map((d) =>
      d.destination_id === id ? { ...d, destination_name: newName } : d
    );
    setDestinations(next);
    saveDestinations(next);
  };

  const handleSaveNewDestination = (dest: Destination, startImmediately: boolean) => {
    const next = [dest, ...destinations];
    setDestinations(next);
    saveDestinations(next);
    void syncRecordToSupabase('destinations', dest as unknown as Record<string, unknown>, user.preferences);

    if (startImmediately) {
      setSelectedDestination(dest);
      setSelectedPresetRoute(null);
      setTab('journey');
    } else {
      setTab('home');
    }
  };

  const fireTriggerAlarm = useCallback(
    (reason: 'gps_proximity' | 'dead_reckoning_eta', currentDistKm: number) => {
      const j = activeJourneyRef.current;
      if (!j || j.journey_status === 'alerting') return;

      const updated: JourneyRecord = {
        ...j,
        journey_status: 'alerting',
        alert_status: reason,
      };
      setActiveJourney(updated);

      const isFallback = reason === 'dead_reckoning_eta';
      appendLog(
        'alert',
        isFallback
          ? `Dead-Reckoning ETA Fallback triggered alarm for ${j.destination_name}`
          : `GPS Proximity threshold (${j.configured_alert_distance} km) reached for ${j.destination_name}`
      );

      void setNativeAlarmScreenMode(true);
      alertEngine.triggerAlarm({
        destinationName: j.destination_name,
        distanceKm: currentDistKm,
        isFallback,
        prefs: userRef.current.preferences,
      });
    },
    [appendLog]
  );

  const clearGpsWatch = useCallback(() => {
    gpsSessionTokenRef.current += 1;
    if (gpsWatchCleanupRef.current) {
      gpsWatchCleanupRef.current();
      gpsWatchCleanupRef.current = null;
    }
    if (recalibrateTimerRef.current !== null) {
      clearTimeout(recalibrateTimerRef.current);
      recalibrateTimerRef.current = null;
    }
  }, []);

  const handleSimulateSignalDrop = useCallback(
    (reason: 'signal_lost' | 'gps_timeout' | 'manual_demo' = 'manual_demo') => {
      const j = activeJourneyRef.current;
      const l = liveStateRef.current;
      if (!j || !l || l.deadReckoningActive) return;

      const speedIsBaseline = l.speedKmh < 8;
      const fallbackSpeedKmh = speedIsBaseline
        ? Math.max(routeBaselineSpeedRef.current, 42)
        : l.speedKmh;

      const estSec = computeDeadReckoningEtaSec(
        l.distanceKm,
        j.configured_alert_distance,
        fallbackSpeedKmh,
        l.remainingStopsCount,
        userRef.current.preferences.stopBufferMinutesPerStop
      );

      setActiveJourney((prev) =>
        prev ? { ...prev, signal_drops_count: prev.signal_drops_count + 1 } : prev
      );

      setLiveState((prev) =>
        prev
          ? {
              ...prev,
              connectionHealth: 'DEAD_RECKONING',
              deadReckoningActive: true,
              drReason: reason,
              drSnapshotDistanceKm: prev.distanceKm,
              drSnapshotSpeedKmh: fallbackSpeedKmh,
              drSpeedIsBaseline: speedIsBaseline,
              drStopsBufferCount: prev.remainingStopsCount,
              drRemainingSec: estSec,
              drTotalEstimatedSec: estSec,
              drEstimatedLat: prev.currentLat,
              drEstimatedLng: prev.currentLng,
              drEstimatedDistanceKm: prev.distanceKm,
              drProgress0to1: prev.simProgress,
              drDriftDeltaKm: null,
              recalibrationNotice: null,
              speedSource: 'estimated',
              gpsStatusNote:
                reason === 'gps_timeout'
                  ? 'No GPS fix received >12s — running Dead-Reckoning estimation'
                  : 'Signal lost — projecting arrival from locked speed & stops buffer',
            }
          : prev
      );

      appendLog(
        'signal_lost',
        `GPS/Signal lost (${reason}) at ${l.distanceKm.toFixed(2)} km (${Math.round(
          fallbackSpeedKmh
        )} km/h + ${l.remainingStopsCount} stops buffer). Est. alert in ${estSec}s`
      );
    },
    [appendLog]
  );

  const handleRestoreSignal = useCallback(
    (overrideFix?: {
      lat: number;
      lng: number;
      speedKmh?: number;
      speedSource?: LiveTrackingState['speedSource'];
      accuracyMeters?: number;
      headingDeg?: number | null;
    }) => {
      const j = activeJourneyRef.current;
      const l = liveStateRef.current;
      if (!j || !l) return;
      if (!l.deadReckoningActive && !overrideFix) return;

      const targetLat = overrideFix ? overrideFix.lat : l.currentLat;
      const targetLng = overrideFix ? overrideFix.lng : l.currentLng;
      const wps = simWaypointsRef.current;
      const snap = computeRouteProgress(wps, targetLat, targetLng, j.configured_alert_distance);
      const directDist = haversineDistanceKm(targetLat, targetLng, j.destination_lat, j.destination_lng);
      const exactDist = snap.offRouteKm <= 8 ? snap.routeRemainingKm : directDist;
      const z = getPollingZoneInfo(exactDist);

      const estDistBeforeRestore = l.drEstimatedDistanceKm;
      const driftDelta =
        estDistBeforeRestore !== null
          ? Number((estDistBeforeRestore - exactDist).toFixed(2))
          : null;

      const driftMsg =
        driftDelta !== null && Math.abs(driftDelta) >= 0.05
          ? ` (Δ ${driftDelta > 0 ? '+' : ''}${driftDelta.toFixed(2)} km synced)`
          : '';

      const speedToUse = overrideFix?.speedKmh ?? l.speedKmh;

      setLiveState((prev) =>
        prev
          ? {
              ...prev,
              currentLat: targetLat,
              currentLng: targetLng,
              distanceKm: exactDist,
              speedKmh: speedToUse,
              speedSource: overrideFix?.speedSource || (j.mode === 'simulator' ? 'simulator' : 'haversine_delta'),
              accuracyMeters: overrideFix?.accuracyMeters ?? prev.accuracyMeters,
              headingDeg: overrideFix?.headingDeg ?? prev.headingDeg,
              etaMinutes: computeLiveEtaMinutes(
                exactDist,
                speedToUse,
                routeBaselineSpeedRef.current
              ),
              pollingZone: z.zone,
              pollIntervalSec: z.intervalSec,
              connectionHealth: 'RECALIBRATED',
              deadReckoningActive: false,
              drReason: null,
              drRemainingSec: null,
              drEstimatedLat: null,
              drEstimatedLng: null,
              drEstimatedDistanceKm: null,
              drProgress0to1: null,
              drDriftDeltaKm: driftDelta,
              simProgress: snap.progress0to1,
              nextStationName: snap.nextStationName,
              remainingStopsCount: snap.remainingStopsCount,
              lastGpsFixAt: Date.now(),
              gpsStatusNote: 'GPS signal re-locked & recalibrated',
              recalibrationNotice: `GPS Re-locked — Exact ${exactDist.toFixed(2)} km remaining${driftMsg}`,
            }
          : prev
      );

      appendLog(
        'signal_restored',
        `Signal restored! Auto-recalibrated from est. to exact ${exactDist.toFixed(2)} km${driftMsg}`
      );

      if (recalibrateTimerRef.current !== null) {
        clearTimeout(recalibrateTimerRef.current);
      }
      recalibrateTimerRef.current = window.setTimeout(() => {
        recalibrateTimerRef.current = null;
        setLiveState((prev) =>
          prev
            ? {
                ...prev,
                connectionHealth: 'ONLINE_GPS',
                recalibrationNotice: null,
                gpsStatusNote: null,
              }
            : prev
        );
      }, 5000);

      if (
        exactDist <= j.configured_alert_distance &&
        j.journey_status === 'active' &&
        Date.now() > snoozeUntilRef.current
      ) {
        fireTriggerAlarm('gps_proximity', exactDist);
      }
    },
    [appendLog, fireTriggerAlarm]
  );

  const handleStartJourney = (config: StartJourneyConfig) => {
    alertEngine.unlockAudio();
    alertEngine.startKeepAlive(config.destination.destination_name);
    void alertEngine.requestNotificationPermission();
    void alertEngine.acquireWakeLock();
    clearGpsWatch();
    snoozeUntilRef.current = 0;
    prevGpsFixRef.current = null;

    const updatedDestinations = destinations.map((d) =>
      d.destination_id === config.destination.destination_id
        ? { ...d, last_used_at: new Date().toISOString() }
        : d
    );
    setDestinations(updatedDestinations);
    saveDestinations(updatedDestinations);
    lastTickMsRef.current = Date.now();

    const preset = MUMBAI_PRESET_ROUTES.find((r) => r.id === config.routeId);
    const resolvedWaypoints =
      config.waypoints && config.waypoints.length >= 2
        ? config.waypoints
        : buildRouteWaypoints({
            startLat: config.startLat,
            startLng: config.startLng,
            startName: config.startName,
            destLat: config.destination.latitude,
            destLng: config.destination.longitude,
            destName: config.destination.destination_name,
            destLine: config.destination.line,
            presetRouteId: config.routeId,
          });

    simWaypointsRef.current = resolvedWaypoints;
    const isLongRoute =
      config.destination.line === 'Express' ||
      config.destination.line === 'Bus' ||
      (resolvedWaypoints[resolvedWaypoints.length - 1]?.cumDistKm || 0) > 60;
    const baseSpeed = preset?.avgSpeedKmh || config.avgSpeedKmh || (isLongRoute ? 74 : 46);
    routeBaselineSpeedRef.current = baseSpeed;

    const progressSnap = computeRouteProgress(
      resolvedWaypoints,
      config.startLat,
      config.startLng,
      config.alertRadiusKm
    );
    const initialDist =
      progressSnap.totalRouteKm > 0.2
        ? progressSnap.totalRouteKm
        : haversineDistanceKm(
            config.startLat,
            config.startLng,
            config.destination.latitude,
            config.destination.longitude
          );
    const zoneInfo = getPollingZoneInfo(initialDist);
    const derivedIntermediateStops = Math.max(0, resolvedWaypoints.length - 2);

    const journey: JourneyRecord = {
      journey_id: `jrn-${Date.now().toString(36)}`,
      user_id: user.user_id,
      start_location_name: config.startName,
      start_lat: config.startLat,
      start_lng: config.startLng,
      selected_destination_id: config.destination.destination_id,
      destination_name: config.destination.destination_name,
      destination_lat: config.destination.latitude,
      destination_lng: config.destination.longitude,
      start_time: new Date().toISOString(),
      journey_status: 'active',
      alert_status: 'none',
      configured_alert_distance: config.alertRadiusKm,
      expected_stops_remaining:
        derivedIntermediateStops > 0 ? derivedIntermediateStops : config.expectedStops,
      mode: config.mode,
      route_id: config.routeId,
      max_speed_kmh: config.mode === 'simulator' ? baseSpeed : 0,
      signal_drops_count: 0,
      estimated_battery_saved_pct: zoneInfo.powerSavingPct,
      min_distance_reached_km: initialDist,
    };

    const defaultSimMultiplier = initialDist > 110 ? 40 : initialDist > 40 ? 20 : 10;
    const initialLive: LiveTrackingState = {
      currentLat: config.startLat,
      currentLng: config.startLng,
      distanceKm: initialDist,
      speedKmh: config.mode === 'simulator' ? baseSpeed : 0,
      speedSource: config.mode === 'simulator' ? 'simulator' : 'haversine_delta',
      accuracyMeters: config.mode === 'simulator' ? 8 : 15,
      headingDeg: null,
      etaMinutes: computeLiveEtaMinutes(initialDist, baseSpeed, baseSpeed),
      pollingZone: zoneInfo.zone,
      pollIntervalSec: zoneInfo.intervalSec,
      connectionHealth: 'ONLINE_GPS',
      deadReckoningActive: false,
      drReason: null,
      drSnapshotDistanceKm: null,
      drSnapshotSpeedKmh: null,
      drSpeedIsBaseline: false,
      drStopsBufferCount: journey.expected_stops_remaining,
      drRemainingSec: null,
      drTotalEstimatedSec: null,
      drEstimatedLat: null,
      drEstimatedLng: null,
      drEstimatedDistanceKm: null,
      drProgress0to1: null,
      drDriftDeltaKm: null,
      recalibrationNotice: null,
      gpsStatusNote:
        config.mode === 'live_gps' ? 'Locking hardware GPS satellites…' : null,
      lastGpsFixAt: config.mode === 'live_gps' ? null : Date.now(),
      consecutiveHitsInRadius: 0,
      gpsChecksPerformed: 1,
      staticBaselineChecks: 1,
      simProgress: 0,
      simSpeedMultiplier: defaultSimMultiplier,
      nextStationName: progressSnap.nextStationName || config.destination.destination_name,
      remainingStopsCount: progressSnap.remainingStopsCount,
      totalRouteKm: initialDist,
      routeWaypoints: resolvedWaypoints,
    };

    setActiveJourney(journey);
    setLiveState(initialLive);
    appendLog(
      'info',
      `Trip armed (${config.mode === 'live_gps' ? 'Real GPS' : 'Simulator'}): ${
        config.startName
      } → ${config.destination.destination_name} (${resolvedWaypoints.length} stops, alert @ ${config.alertRadiusKm} km)`
    );

    if (config.mode === 'live_gps' && isGeoAvailable()) {
      const token = gpsSessionTokenRef.current;
      void watchPositionUnified(
        (pos) => {
          const curJ = activeJourneyRef.current;
          const curL = liveStateRef.current;
          if (!curJ || !curL || curJ.journey_status !== 'active') return;

          const lat = pos.latitude;
          const lng = pos.longitude;
          const nowMs = Date.now();
          const accuracy = pos.accuracy || 15;
          const maxAcceptedAccuracy = Math.max(800, curJ.configured_alert_distance * 400);
          if (accuracy > maxAcceptedAccuracy) {
            return;
          }

          // Compute speed from hardware sensor OR haversine displacement delta
          let measuredSpeedKmh = curL.speedKmh;
          let spdSrc: LiveTrackingState['speedSource'] = curL.speedSource;
          if (typeof pos.speed === 'number' && pos.speed >= 0.4) {
            measuredSpeedKmh = pos.speed * 3.6;
            spdSrc = 'gps_sensor';
            prevGpsFixRef.current = { lat, lng, timeMs: nowMs };
          } else if (prevGpsFixRef.current) {
            const dtHours = (nowMs - prevGpsFixRef.current.timeMs) / 3_600_000;
            if (dtHours > 0.00083) {
              const movedKm = haversineDistanceKm(
                prevGpsFixRef.current.lat,
                prevGpsFixRef.current.lng,
                lat,
                lng
              );
              if (movedKm >= 0.015) {
                const rawKmh = movedKm / dtHours;
                if (rawKmh < 240) {
                  measuredSpeedKmh =
                    curL.speedKmh > 0 ? curL.speedKmh * 0.45 + rawKmh * 0.55 : rawKmh;
                  spdSrc = 'haversine_delta';
                }
                prevGpsFixRef.current = { lat, lng, timeMs: nowMs };
              } else {
                measuredSpeedKmh = curL.speedKmh * 0.3 < 2 ? 0 : curL.speedKmh * 0.3;
                prevGpsFixRef.current = { lat, lng, timeMs: nowMs };
              }
            }
          } else {
            prevGpsFixRef.current = { lat, lng, timeMs: nowMs };
          }

          // AUTO-RECOVER when GPS signal comes back after blackout!
          if (curL.deadReckoningActive && curL.drReason !== 'manual_demo') {
            handleRestoreSignal({
              lat,
              lng,
              speedKmh: measuredSpeedKmh,
              speedSource: spdSrc,
              accuracyMeters: accuracy,
              headingDeg: pos.heading ?? null,
            });
            return;
          }

          const snap = computeRouteProgress(
            simWaypointsRef.current,
            lat,
            lng,
            curJ.configured_alert_distance
          );
          const directDist = haversineDistanceKm(
            lat,
            lng,
            curJ.destination_lat,
            curJ.destination_lng
          );
          const dist = snap.offRouteKm <= 8 ? Math.min(directDist, snap.routeRemainingKm) : directDist;
          const z = getPollingZoneInfo(dist);

          const hits =
            dist <= curJ.configured_alert_distance && Date.now() > snoozeUntilRef.current
              ? curL.consecutiveHitsInRadius + 1
              : 0;

          if (measuredSpeedKmh > curJ.max_speed_kmh) {
            setActiveJourney((prev) =>
              prev ? { ...prev, max_speed_kmh: Math.round(measuredSpeedKmh) } : prev
            );
          }

          setLiveState((prev) =>
            prev
              ? {
                  ...prev,
                  currentLat: lat,
                  currentLng: lng,
                  distanceKm: dist,
                  speedKmh: measuredSpeedKmh,
                  speedSource: spdSrc,
                  accuracyMeters: accuracy,
                  headingDeg: pos.heading ?? prev.headingDeg,
                  etaMinutes: computeLiveEtaMinutes(
                    dist,
                    measuredSpeedKmh,
                    routeBaselineSpeedRef.current
                  ),
                  pollingZone: z.zone,
                  pollIntervalSec: z.intervalSec,
                  simProgress: snap.progress0to1,
                  nextStationName: snap.nextStationName,
                  remainingStopsCount: snap.remainingStopsCount,
                  lastGpsFixAt: nowMs,
                  gpsStatusNote: null,
                  consecutiveHitsInRadius: hits,
                  gpsChecksPerformed: prev.gpsChecksPerformed + 1,
                }
              : prev
          );

          if (hits >= 1) {
            fireTriggerAlarm('gps_proximity', dist);
          }
        },
        (err) => {
          if (err.code === 1) {
            setLiveState((prev) =>
              prev
                ? {
                    ...prev,
                    gpsStatusNote:
                      'Location permission denied — allow location in settings or use Simulator.',
                  }
                : prev
            );
            appendLog('info', 'Location permission denied by device/browser');
          } else {
            handleSimulateSignalDrop('gps_timeout');
          }
        }
      ).then((cleanup) => {
        if (gpsSessionTokenRef.current !== token) {
          cleanup();
        } else {
          gpsWatchCleanupRef.current = cleanup;
        }
      });
    }

    setTab('journey');
  };

  useEffect(() => {
    const onOffline = () => {
      if (activeJourneyRef.current?.journey_status === 'active') {
        handleSimulateSignalDrop('signal_lost');
      }
    };
    const onOnline = () => {
      const j = activeJourneyRef.current;
      const l = liveStateRef.current;
      if (!j || j.journey_status !== 'active' || !l?.deadReckoningActive) return;
      if (j.mode === 'live_gps' && isGeoAvailable()) {
        void getCurrentPositionUnified(5000)
          .then((pos) => {
            handleRestoreSignal({
              lat: pos.latitude,
              lng: pos.longitude,
              speedKmh:
                typeof pos.speed === 'number' && pos.speed >= 0.4
                  ? pos.speed * 3.6
                  : l.speedKmh,
              accuracyMeters: pos.accuracy || l.accuracyMeters,
              headingDeg: pos.heading ?? l.headingDeg,
            });
          })
          .catch(() => {
            // Stay in Dead Reckoning until real GPS fix restores
          });
      } else {
        handleRestoreSignal();
      }
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [handleRestoreSignal, handleSimulateSignalDrop]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const nowMs = Date.now();
      const dtRealSec = Math.min(10, Math.max(0.5, (nowMs - lastTickMsRef.current) / 1000));
      lastTickMsRef.current = nowMs;

      const j = activeJourneyRef.current;
      const l = liveStateRef.current;
      if (!j || !l || j.journey_status !== 'active') return;

      let nextGpsChecks = l.gpsChecksPerformed;
      const nextStaticChecks = l.staticBaselineChecks + 1;
      if (!l.deadReckoningActive && nextStaticChecks % Math.max(1, Math.round(l.pollIntervalSec / 3)) === 0) {
        nextGpsChecks += 1;
      }

      if (j.mode === 'simulator') {
        const wps = simWaypointsRef.current;
        const totalCorridorKm = Math.max(2, l.totalRouteKm);
        const baseSpeedKmh =
          MUMBAI_PRESET_ROUTES.find((r) => r.id === j.route_id)?.avgSpeedKmh ||
          routeBaselineSpeedRef.current;

        const actualSpeedKmh = l.deadReckoningActive ? baseSpeedKmh * 0.92 : baseSpeedKmh;
        const dtSimSec = l.simSpeedMultiplier * dtRealSec;
        const kmPerTick = (actualSpeedKmh / 3600) * dtSimSec;
        const nextProgress = Math.min(1, l.simProgress + kmPerTick / totalCorridorKm);

        const pos = interpolateStations(wps, nextProgress);
        const snap = computeRouteProgress(wps, pos.lat, pos.lng, j.configured_alert_distance);
        const trueDist = Math.max(0, snap.routeRemainingKm);
        const zoneInfo = getPollingZoneInfo(trueDist);

        if (zoneInfo.zone !== l.pollingZone && !l.deadReckoningActive) {
          appendLog('zone_change', `Adaptive GPS switched to ${zoneInfo.label}`);
        }

        if (l.deadReckoningActive && l.drRemainingSec !== null) {
          const totalEst = Math.max(1, l.drTotalEstimatedSec || l.drRemainingSec);
          const nextRemaining = Math.max(0, l.drRemainingSec - dtSimSec);
          const fractionLeft = nextRemaining / totalEst;
          const snapStartDist = l.drSnapshotDistanceKm ?? l.distanceKm;
          const targetAlertDist = Math.min(snapStartDist, j.configured_alert_distance);
          const nextEstDist = Number(
            (targetAlertDist + Math.max(0, snapStartDist - targetAlertDist) * fractionLeft).toFixed(2)
          );
          const nextDrProg = Math.min(
            1,
            Math.max(0, 1 - nextEstDist / totalCorridorKm)
          );
          const drPos = interpolateStations(wps, nextDrProg);
          const drSnap = computeRouteProgress(wps, drPos.lat, drPos.lng, j.configured_alert_distance);

          setLiveState((prev) =>
            prev
              ? {
                  ...prev,
                  simProgress: nextProgress,
                  currentLat: pos.lat,
                  currentLng: pos.lng,
                  distanceKm: trueDist,
                  drProgress0to1: nextDrProg,
                  drEstimatedLat: drPos.lat,
                  drEstimatedLng: drPos.lng,
                  drEstimatedDistanceKm: nextEstDist,
                  nextStationName: drSnap.nextStationName,
                  remainingStopsCount: drSnap.remainingStopsCount,
                  drRemainingSec: Math.round(nextRemaining),
                  staticBaselineChecks: nextStaticChecks,
                }
              : prev
          );

          if (nextRemaining <= 0 && Date.now() > snoozeUntilRef.current) {
            fireTriggerAlarm('dead_reckoning_eta', nextEstDist);
          }
          return;
        }

        const etaMin = Math.max(1, Math.round((trueDist / baseSpeedKmh) * 60));
        setLiveState((prev) =>
          prev
            ? {
                ...prev,
                simProgress: nextProgress,
                currentLat: pos.lat,
                currentLng: pos.lng,
                distanceKm: trueDist,
                speedKmh: baseSpeedKmh,
                speedSource: 'simulator',
                etaMinutes: etaMin,
                pollingZone: zoneInfo.zone,
                pollIntervalSec: zoneInfo.intervalSec,
                nextStationName: snap.nextStationName,
                remainingStopsCount: snap.remainingStopsCount,
                gpsChecksPerformed: nextGpsChecks,
                staticBaselineChecks: nextStaticChecks,
              }
            : prev
        );

        if (trueDist <= j.configured_alert_distance && Date.now() > snoozeUntilRef.current) {
          fireTriggerAlarm('gps_proximity', trueDist);
        }
      } else {
        // Real GPS mode watchdog & wall-clock Dead-Reckoning kinematics
        if (
          !l.deadReckoningActive &&
          l.lastGpsFixAt &&
          Date.now() - l.lastGpsFixAt > 12_000
        ) {
          handleSimulateSignalDrop('gps_timeout');
          return;
        }

        if (!l.deadReckoningActive) {
          // Track 3s static baseline checks so battery saving % in live_gps mode stays accurate
          setLiveState((prev) =>
            prev ? { ...prev, staticBaselineChecks: prev.staticBaselineChecks + 1 } : prev
          );
          return;
        }

        if (l.deadReckoningActive && l.drRemainingSec !== null) {
          const totalEst = Math.max(1, l.drTotalEstimatedSec || l.drRemainingSec);
          const nextRemaining = Math.max(0, l.drRemainingSec - dtRealSec);
          const fractionLeft = nextRemaining / totalEst;
          const snapStartDist = l.drSnapshotDistanceKm ?? l.distanceKm;
          const targetAlertDist = Math.min(snapStartDist, j.configured_alert_distance);
          const nextEstDist = Number(
            (targetAlertDist + Math.max(0, snapStartDist - targetAlertDist) * fractionLeft).toFixed(2)
          );
          const totalCorridorKm = Math.max(2, l.totalRouteKm);
          const nextDrProg = Math.min(
            1,
            Math.max(0, 1 - nextEstDist / totalCorridorKm)
          );
          const drPos = interpolateStations(simWaypointsRef.current, nextDrProg);
          const drSnap = computeRouteProgress(
            simWaypointsRef.current,
            drPos.lat,
            drPos.lng,
            j.configured_alert_distance
          );

          setLiveState((prev) =>
            prev
              ? {
                  ...prev,
                  drProgress0to1: nextDrProg,
                  drEstimatedLat: drPos.lat,
                  drEstimatedLng: drPos.lng,
                  drEstimatedDistanceKm: nextEstDist,
                  nextStationName: drSnap.nextStationName,
                  remainingStopsCount: drSnap.remainingStopsCount,
                  drRemainingSec: Math.round(nextRemaining),
                  staticBaselineChecks: nextStaticChecks,
                }
              : prev
          );
          if (nextRemaining <= 0 && Date.now() > snoozeUntilRef.current) {
            fireTriggerAlarm('dead_reckoning_eta', nextEstDist);
          }
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [appendLog, fireTriggerAlarm, handleSimulateSignalDrop]);

  const handleStopAndSaveJourney = (
    finalStatus: JourneyRecord['journey_status'],
    alertStatus?: JourneyRecord['alert_status']
  ) => {
    alertEngine.stopAlarm();
    void setNativeAlarmScreenMode(false);
    void alertEngine.releaseWakeLock();
    clearGpsWatch();

    const j = activeJourneyRef.current;
    const l = liveStateRef.current;
    if (j) {
      const savedPct =
        l && l.staticBaselineChecks > 0
          ? Math.max(
              15,
              Math.round(((l.staticBaselineChecks - l.gpsChecksPerformed) / l.staticBaselineChecks) * 100)
            )
          : j.estimated_battery_saved_pct;

      const completedRecord: JourneyRecord = {
        ...j,
        end_time: new Date().toISOString(),
        journey_status: finalStatus,
        alert_status: alertStatus || j.alert_status,
        estimated_battery_saved_pct: savedPct,
        min_distance_reached_km: l ? Math.min(j.min_distance_reached_km, l.distanceKm) : j.min_distance_reached_km,
      };

      setJourneys((prev) => {
        const next = [completedRecord, ...prev];
        saveJourneys(next);
        return next;
      });
      void syncRecordToSupabase(
        'journeys',
        completedRecord as unknown as Record<string, unknown>,
        user.preferences
      );
      appendLog('info', `Trip ended (${finalStatus}) · Battery saved: ${savedPct}%`);
    }

    setActiveJourney(null);
    setLiveState(null);
  };

  const handleSnoozeAlarm = () => {
    alertEngine.stopAlarm();
    void setNativeAlarmScreenMode(false);
    snoozeUntilRef.current = Date.now() + 30_000;
    setActiveJourney((prev) =>
      prev ? { ...prev, journey_status: 'active', alert_status: 'snoozed' } : prev
    );
    appendLog('info', 'Alarm snoozed for 30 seconds');
  };

  const handleJumpNearAlert = () => {
    const j = activeJourneyRef.current;
    const l = liveStateRef.current;
    if (!j || !l) return;

    if (j.mode === 'simulator') {
      const totalKm = Math.max(2, l.totalRouteKm);
      const targetDist = j.configured_alert_distance + 0.9;
      const targetProgress = Math.min(0.97, Math.max(0.1, 1 - targetDist / totalKm));
      const pos = interpolateStations(simWaypointsRef.current, targetProgress);
      const snap = computeRouteProgress(
        simWaypointsRef.current,
        pos.lat,
        pos.lng,
        j.configured_alert_distance
      );
      const actualDist = snap.routeRemainingKm;
      const z = getPollingZoneInfo(actualDist);

      const drEstSec = l.deadReckoningActive
        ? computeDeadReckoningEtaSec(
            actualDist,
            j.configured_alert_distance,
            l.drSnapshotSpeedKmh || l.speedKmh,
            snap.remainingStopsCount,
            userRef.current.preferences.stopBufferMinutesPerStop
          )
        : null;

      setLiveState((prev) =>
        prev
          ? {
              ...prev,
              simProgress: targetProgress,
              currentLat: pos.lat,
              currentLng: pos.lng,
              distanceKm: actualDist,
              pollingZone: z.zone,
              pollIntervalSec: z.intervalSec,
              nextStationName: snap.nextStationName,
              remainingStopsCount: snap.remainingStopsCount,
              simSpeedMultiplier: 8,
              ...(prev.deadReckoningActive
                ? {
                    drSnapshotDistanceKm: actualDist,
                    drEstimatedDistanceKm: actualDist,
                    drEstimatedLat: pos.lat,
                    drEstimatedLng: pos.lng,
                    drProgress0to1: targetProgress,
                    drStopsBufferCount: snap.remainingStopsCount,
                    drRemainingSec: drEstSec,
                    drTotalEstimatedSec: drEstSec,
                  }
                : {}),
            }
          : prev
      );
      appendLog('zone_change', `Jumped near approach (${actualDist.toFixed(2)} km) — ${z.label}`);
    }
  };

  const handleTestFullAlarm = () => {
    alertEngine.unlockAudio();
    if (testAlarmTimerRef.current !== null) {
      clearTimeout(testAlarmTimerRef.current);
      testAlarmTimerRef.current = null;
    }
    const dummyDest = destinations[0];
    if (!activeJourney) {
      alertEngine.triggerAlarm({
        destinationName: dummyDest?.destination_name || 'Pune Junction',
        distanceKm: 2.4,
        isFallback: false,
        prefs: user.preferences,
      });
      testAlarmTimerRef.current = window.setTimeout(() => {
        alertEngine.stopAlarm();
        testAlarmTimerRef.current = null;
      }, 4500);
      appendLog('alert', 'Ran 4.5s sound, vibration, and voice alarm self-test');
    } else {
      fireTriggerAlarm('gps_proximity', liveState?.distanceKm || 1.2);
    }
  };

  const handleStopTestAlarm = () => {
    if (testAlarmTimerRef.current !== null) {
      clearTimeout(testAlarmTimerRef.current);
      testAlarmTimerRef.current = null;
    }
    alertEngine.stopAlarm();
  };

  const navItems = [
    { id: 'home' as const, label: 'Home', icon: Home },
    { id: 'add' as const, label: 'Search', icon: Search },
    { id: 'journey' as const, label: activeJourney ? 'Active' : 'Trip', icon: Compass },
    { id: 'settings' as const, label: 'Settings', icon: Settings },
  ];

  const isDark = user.preferences.theme === 'dark';

  return (
    <div
      className={`min-h-dvh w-full bg-[#f5f7fa] text-slate-900 transition-colors duration-150 dark:bg-[#0a0d12] dark:text-slate-100 ${
        showLaunchIntro ? 'h-dvh overflow-hidden' : ''
      }`}
    >
      <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-[#f5f7fa] md:border-x md:border-slate-200/80 md:shadow-xl dark:bg-[#0a0d12] dark:md:border-white/[0.08]">
        {/* Clean Mobile Header (Brand + Quick Theme Toggle + Profile + Safe Top Bar) */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200/80 bg-[#f5f7fa]/92 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#0a0d12]/92">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm dark:bg-blue-500">
              <Navigation className="h-4 w-4" />
            </span>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                WakeMe
              </span>
              {liveState?.deadReckoningActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  <WifiOff className="h-2.5 w-2.5" />
                  Fallback
                </span>
              ) : activeJourney ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                  <Radio className="h-2.5 w-2.5 animate-pulse" />
                  Armed
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleThemeQuick}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="pressable flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 hover:text-blue-600 dark:border-white/10 dark:bg-[#141923] dark:text-slate-200"
            >
              {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              aria-label="Open commuter account"
              className="pressable flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-blue-500/40 dark:border-white/10 dark:bg-[#141923] dark:text-slate-200"
            >
              <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span className="max-w-[72px] truncate">{user.name.split(' ')[0]}</span>
            </button>
          </div>
        </header>

        {/* Main Screen Body */}
        <main className="flex-1 px-4 pb-24 pt-4">
          {tab === 'home' && (
            <HomeScreen
              destinations={destinations}
              hasActiveJourney={Boolean(activeJourney)}
              onGoToSearch={() => setTab('add')}
              onStartWithDestination={(dest) => {
                setSelectedDestination(dest);
                setSelectedPresetRoute(null);
                setTab('journey');
              }}
              onStartPresetRoute={(route) => {
                setSelectedPresetRoute(route);
                setSelectedDestination(null);
                setTab('journey');
              }}
              onResumeJourney={() => setTab('journey')}
              onToggleFavourite={handleToggleFavourite}
              onDeleteDestination={handleDeleteDestination}
              onRenameDestination={handleRenameDestination}
            />
          )}

          {tab === 'add' && (
            <AddDestinationScreen
              theme={user.preferences.theme}
              userId={user.user_id}
              onBack={() => setTab('home')}
              onSaveDestination={handleSaveNewDestination}
            />
          )}

          {tab === 'journey' && (
            <JourneyScreen
              theme={user.preferences.theme}
              destinations={destinations}
              preferences={user.preferences}
              selectedDestination={selectedDestination}
              selectedPresetRoute={selectedPresetRoute}
              activeJourney={activeJourney}
              liveState={liveState}
              onStartJourney={handleStartJourney}
              onSwitchToSearch={() => setTab('add')}
              onSwitchToSimulator={() => {
                handleStopAndSaveJourney('cancelled');
              }}
              onPauseResume={() => {
                const cur = activeJourneyRef.current;
                if (!cur) return;
                const nextStatus = cur.journey_status === 'paused' ? 'active' : 'paused';
                if (nextStatus === 'paused') {
                  void alertEngine.releaseWakeLock();
                } else {
                  lastTickMsRef.current = Date.now();
                  alertEngine.startKeepAlive(cur.destination_name);
                  void alertEngine.acquireWakeLock();
                  setLiveState((l) => (l ? { ...l, lastGpsFixAt: Date.now() } : l));
                }
                setActiveJourney((prev) =>
                  prev ? { ...prev, journey_status: nextStatus } : prev
                );
              }}
              onStopJourney={() => handleStopAndSaveJourney('cancelled')}
              onSimulateSignalDrop={() => handleSimulateSignalDrop('manual_demo')}
              onRestoreSignal={() => handleRestoreSignal()}
              onChangeSimSpeed={(mult) =>
                setLiveState((prev) => (prev ? { ...prev, simSpeedMultiplier: mult } : prev))
              }
              onJumpNearAlert={handleJumpNearAlert}
              onForceTestAlarm={() => {
                alertEngine.unlockAudio();
                fireTriggerAlarm(
                  liveState?.deadReckoningActive ? 'dead_reckoning_eta' : 'gps_proximity',
                  liveState?.deadReckoningActive
                    ? liveState.drEstimatedDistanceKm ?? liveState.distanceKm
                    : liveState?.distanceKm ?? 1.2
                );
              }}
              onUpdateAlertRadius={(km) => {
                setActiveJourney((prev) =>
                  prev ? { ...prev, configured_alert_distance: km } : prev
                );
                setLiveState((prev) => {
                  if (!prev || !prev.deadReckoningActive) return prev;
                  const curEstDist = prev.drEstimatedDistanceKm ?? prev.distanceKm;
                  const nextSec = computeDeadReckoningEtaSec(
                    curEstDist,
                    km,
                    prev.drSnapshotSpeedKmh || prev.speedKmh,
                    prev.drStopsBufferCount,
                    userRef.current.preferences.stopBufferMinutesPerStop
                  );
                  return {
                    ...prev,
                    drSnapshotDistanceKm: curEstDist,
                    drRemainingSec: nextSec,
                    drTotalEstimatedSec: nextSec,
                  };
                });
              }}
            />
          )}

          {tab === 'settings' && (
            <SettingsTelemetryScreen
              preferences={user.preferences}
              savedPlacesCount={destinations.length}
              journeys={journeys}
              telemetryLogs={telemetryLogs}
              canInstallPwa={Boolean(deferredInstallPrompt)}
              onInstallPwa={async () => {
                if (!deferredInstallPrompt) return;
                await deferredInstallPrompt.prompt();
                await deferredInstallPrompt.userChoice;
                setDeferredInstallPrompt(null);
              }}
              onUpdatePreferences={handleUpdatePreferences}
              onTestFullAlarm={handleTestFullAlarm}
              onStopTestAlarm={handleStopTestAlarm}
              onClearLogs={() => {
                setTelemetryLogs([]);
                saveTelemetryLogs([]);
              }}
              onClearHistory={() => {
                setJourneys([]);
                saveJourneys([]);
              }}
              onResetDefaults={() => {
                handleUpdatePreferences({
                  ...DEFAULT_PREFERENCES,
                  theme: user.preferences.theme,
                });
                setDestinations(DEFAULT_DESTINATIONS);
                saveDestinations(DEFAULT_DESTINATIONS);
              }}
            />
          )}
        </main>

        {/* Bottom Dock Navigation */}
        <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-[440px] -translate-x-1/2 border-t border-slate-200/80 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-[#0a0d12]/95">
          <div className="grid grid-cols-4 gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`pressable relative flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-2xl px-2 py-1.5 ${
                    active
                      ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  {item.id === 'journey' && activeJourney && (
                    <span className="absolute right-5 top-2 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                  <Icon className={`h-5 w-5 ${active ? 'stroke-[2.3]' : 'stroke-[1.8]'}`} />
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {/* Account Modal */}
      <AuthModal
        user={user}
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSaveUser={handleSaveUser}
      />

      {/* Full-Screen Alarm Overlay */}
      {activeJourney?.journey_status === 'alerting' && liveState && (
        <AlarmOverlay
          destinationName={activeJourney.destination_name}
          distanceKm={
            liveState.deadReckoningActive && liveState.drEstimatedDistanceKm !== null
              ? liveState.drEstimatedDistanceKm
              : liveState.distanceKm
          }
          isFallbackTrigger={activeJourney.alert_status === 'dead_reckoning_eta'}
          voiceLang={user.preferences.voiceLanguage}
          onSnooze={handleSnoozeAlarm}
          onDismiss={() => handleStopAndSaveJourney('completed', 'dismissed')}
        />
      )}

      {/* Auto-Startup Permissions Sheet (Location, Notifications & Background Battery) */}
      {permReadiness && (
        <StartupPermissionsModal
          isOpen={startupPermsOpen}
          readiness={permReadiness}
          onUpdateReadiness={setPermReadiness}
          onComplete={() => setStartupPermsOpen(false)}
        />
      )}

      {/* Rapido / Uber-Inspired Launch Animation */}
      {showLaunchIntro && <LaunchSplashIntro onComplete={handleSplashComplete} />}
    </div>
  );
}

export default App;
