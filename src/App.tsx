import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Home, Navigation, PlusCircle, Radio, Settings, User, WifiOff } from 'lucide-react';
import { AddDestinationScreen } from './components/AddDestinationScreen';
import { AlarmOverlay } from './components/AlarmOverlay';
import { AuthModal } from './components/AuthModal';
import { HomeScreen } from './components/HomeScreen';
import { JourneyScreen, StartJourneyConfig } from './components/JourneyScreen';
import { LiveMap } from './components/LiveMap';
import { SettingsTelemetryScreen } from './components/SettingsTelemetryScreen';
import { MUMBAI_PRESET_ROUTES, getStationById } from './data/mumbaiLocal';
import { alertEngine } from './services/alertEngine';
import {
  computeDeadReckoningEtaSec,
  getPollingZoneInfo,
  haversineDistanceKm,
  interpolateStations,
} from './services/geoEngine';
import {
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
  TelemetryLogEntry,
  UserPreferences,
  UserProfile,
} from './types/wakeme';

type TabKey = 'home' | 'add' | 'journey' | 'settings';

export function App() {
  const [tab, setTab] = useState<TabKey>('home');
  const [user, setUser] = useState<UserProfile>(() => loadUserProfile());
  const [destinations, setDestinations] = useState<Destination[]>(() => loadDestinations());
  const [journeys, setJourneys] = useState<JourneyRecord[]>(() => loadJourneys());
  const [telemetryLogs, setTelemetryLogs] = useState<TelemetryLogEntry[]>(() => loadTelemetryLogs());
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Map preview / add pin state
  const [previewDestination, setPreviewDestination] = useState<Destination | null>(
    () => loadDestinations()[0] || null
  );
  const [pickedCoords, setPickedCoords] = useState<{ lat: number; lng: number }>({
    lat: 19.0185,
    lng: 72.8435,
  });

  // Pre-selected target for Journey tab
  const [selectedDestination, setSelectedDestination] = useState<Destination | null>(null);
  const [selectedPresetRoute, setSelectedPresetRoute] = useState<MumbaiPresetRoute | null>(null);

  // Active Journey & Live Tracking State
  const [activeJourney, setActiveJourney] = useState<JourneyRecord | null>(null);
  const [liveState, setLiveState] = useState<LiveTrackingState | null>(null);

  const activeJourneyRef = useRef<JourneyRecord | null>(null);
  const liveStateRef = useRef<LiveTrackingState | null>(null);
  const userRef = useRef<UserProfile>(user);
  const gpsWatchIdRef = useRef<number | null>(null);
  const simWaypointsRef = useRef<Array<{ name: string; lat: number; lng: number }>>([]);
  const snoozeUntilRef = useRef<number>(0);

  activeJourneyRef.current = activeJourney;
  liveStateRef.current = liveState;
  userRef.current = user;

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
    setPreviewDestination(dest);
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
    if (gpsWatchIdRef.current !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
  }, []);

  const handleSimulateSignalDrop = useCallback(() => {
    const j = activeJourneyRef.current;
    const l = liveStateRef.current;
    if (!j || !l || l.deadReckoningActive) return;

    const estSec = computeDeadReckoningEtaSec(
      l.distanceKm,
      j.configured_alert_distance,
      l.speedKmh,
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
            drSnapshotDistanceKm: prev.distanceKm,
            drSnapshotSpeedKmh: Math.max(prev.speedKmh, 22),
            drStopsBufferCount: prev.remainingStopsCount,
            drRemainingSec: estSec,
            drTotalEstimatedSec: estSec,
            recalibrationNotice: null,
          }
        : prev
    );

    appendLog(
      'signal_lost',
      `Signal lost at ${l.distanceKm.toFixed(2)} km (${Math.round(
        Math.max(l.speedKmh, 22)
      )} km/h + ${l.remainingStopsCount} stops buffer). Fallback timer: ${estSec}s`
    );
  }, [appendLog]);

  const handleRestoreSignal = useCallback(() => {
    const j = activeJourneyRef.current;
    const l = liveStateRef.current;
    if (!j || !l || !l.deadReckoningActive) return;

    const recalibratedDist = l.distanceKm;
    const z = getPollingZoneInfo(recalibratedDist);

    setLiveState((prev) =>
      prev
        ? {
            ...prev,
            connectionHealth: 'RECALIBRATED',
            deadReckoningActive: false,
            drRemainingSec: null,
            pollingZone: z.zone,
            pollIntervalSec: z.intervalSec,
            recalibrationNotice: `Signal Restored — Re-calibrated: ${recalibratedDist.toFixed(
              2
            )} km remaining`,
          }
        : prev
    );

    appendLog(
      'signal_restored',
      `Signal restored! Auto-recalibrated distance: ${recalibratedDist.toFixed(2)} km`
    );

    window.setTimeout(() => {
      setLiveState((prev) =>
        prev
          ? { ...prev, connectionHealth: 'ONLINE_GPS', recalibrationNotice: null }
          : prev
      );
    }, 4500);

    if (
      recalibratedDist <= j.configured_alert_distance &&
      j.journey_status === 'active' &&
      Date.now() > snoozeUntilRef.current
    ) {
      fireTriggerAlarm('gps_proximity', recalibratedDist);
    }
  }, [appendLog, fireTriggerAlarm]);

  const handleStartJourney = (config: StartJourneyConfig) => {
    alertEngine.unlockAudio();
    void alertEngine.requestNotificationPermission();
    void alertEngine.acquireWakeLock();
    clearGpsWatch();
    snoozeUntilRef.current = 0;

    setDestinations((prev) => {
      const next = prev.map((d) =>
        d.destination_id === config.destination.destination_id
          ? { ...d, last_used_at: new Date().toISOString() }
          : d
      );
      saveDestinations(next);
      return next;
    });

    const preset = MUMBAI_PRESET_ROUTES.find((r) => r.id === config.routeId);
    if (preset) {
      simWaypointsRef.current = preset.stationIds
        .map((id) => getStationById(id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s))
        .map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }));
    } else {
      simWaypointsRef.current = [
        { name: config.startName, lat: config.startLat, lng: config.startLng },
        {
          name: config.destination.destination_name,
          lat: config.destination.latitude,
          lng: config.destination.longitude,
        },
      ];
    }

    const initialDist = haversineDistanceKm(
      config.startLat,
      config.startLng,
      config.destination.latitude,
      config.destination.longitude
    );
    const zoneInfo = getPollingZoneInfo(initialDist);

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
      expected_stops_remaining: config.expectedStops,
      mode: config.mode,
      route_id: config.routeId,
      max_speed_kmh: config.mode === 'simulator' ? preset?.avgSpeedKmh || 52 : 0,
      signal_drops_count: 0,
      estimated_battery_saved_pct: zoneInfo.powerSavingPct,
      min_distance_reached_km: initialDist,
    };

    const initialLive: LiveTrackingState = {
      currentLat: config.startLat,
      currentLng: config.startLng,
      distanceKm: initialDist,
      speedKmh: config.mode === 'simulator' ? preset?.avgSpeedKmh || 52 : 0,
      accuracyMeters: config.mode === 'simulator' ? 8 : 15,
      etaMinutes: Math.max(
        1,
        Math.round((initialDist / (preset?.avgSpeedKmh || 48)) * 60)
      ),
      pollingZone: zoneInfo.zone,
      pollIntervalSec: zoneInfo.intervalSec,
      connectionHealth: 'ONLINE_GPS',
      deadReckoningActive: false,
      drSnapshotDistanceKm: null,
      drSnapshotSpeedKmh: null,
      drStopsBufferCount: config.expectedStops,
      drRemainingSec: null,
      drTotalEstimatedSec: null,
      recalibrationNotice: null,
      consecutiveHitsInRadius: 0,
      gpsChecksPerformed: 1,
      staticBaselineChecks: 1,
      simProgress: 0,
      simSpeedMultiplier: 15,
      nextStationName: simWaypointsRef.current[1]?.name || config.destination.destination_name,
      remainingStopsCount: config.expectedStops,
    };

    setActiveJourney(journey);
    setLiveState(initialLive);
    appendLog(
      'info',
      `Journey armed: ${config.startName} to ${config.destination.destination_name} (Alert @ ${config.alertRadiusKm} km)`
    );

    if (config.mode === 'live_gps' && 'geolocation' in navigator) {
      gpsWatchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const curJ = activeJourneyRef.current;
          const curL = liveStateRef.current;
          if (!curJ || !curL || curJ.journey_status !== 'active') return;
          if (curL.deadReckoningActive) return;

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const speedKmh = pos.coords.speed ? Math.max(0, pos.coords.speed * 3.6) : curL.speedKmh;
          const dist = haversineDistanceKm(lat, lng, curJ.destination_lat, curJ.destination_lng);
          const z = getPollingZoneInfo(dist);

          const hits =
            dist <= curJ.configured_alert_distance && Date.now() > snoozeUntilRef.current
              ? curL.consecutiveHitsInRadius + 1
              : 0;

          setLiveState((prev) =>
            prev
              ? {
                  ...prev,
                  currentLat: lat,
                  currentLng: lng,
                  distanceKm: dist,
                  speedKmh,
                  accuracyMeters: pos.coords.accuracy || 15,
                  etaMinutes: speedKmh > 3 ? Math.max(1, Math.round((dist / speedKmh) * 60)) : null,
                  pollingZone: z.zone,
                  pollIntervalSec: z.intervalSec,
                  consecutiveHitsInRadius: hits,
                  gpsChecksPerformed: prev.gpsChecksPerformed + 1,
                }
              : prev
          );

          if (hits >= 1) {
            fireTriggerAlarm('gps_proximity', dist);
          }
        },
        () => {
          handleSimulateSignalDrop();
        },
        { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
      );
    }

    setTab('journey');
  };

  useEffect(() => {
    const onOffline = () => {
      if (activeJourneyRef.current?.journey_status === 'active') {
        handleSimulateSignalDrop();
      }
    };
    const onOnline = () => {
      if (activeJourneyRef.current?.journey_status === 'active') {
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
        const totalCorridorKm = Math.max(
          2,
          haversineDistanceKm(j.start_lat, j.start_lng, j.destination_lat, j.destination_lng)
        );
        const speedKmh =
          MUMBAI_PRESET_ROUTES.find((r) => r.id === j.route_id)?.avgSpeedKmh || 52;
        const kmPerRealSec = (speedKmh / 3600) * l.simSpeedMultiplier;
        const deltaProgress = kmPerRealSec / totalCorridorKm;
        const nextProgress = Math.min(1, l.simProgress + deltaProgress);

        const pos = interpolateStations(wps, nextProgress);
        const trueDist = haversineDistanceKm(
          pos.lat,
          pos.lng,
          j.destination_lat,
          j.destination_lng
        );
        const zoneInfo = getPollingZoneInfo(trueDist);

        if (zoneInfo.zone !== l.pollingZone && !l.deadReckoningActive) {
          appendLog('zone_change', `Adaptive GPS switched to ${zoneInfo.label}`);
        }

        if (l.deadReckoningActive && l.drRemainingSec !== null) {
          const nextRemaining = Math.max(0, l.drRemainingSec - l.simSpeedMultiplier);
          setLiveState((prev) =>
            prev
              ? {
                  ...prev,
                  simProgress: nextProgress,
                  currentLat: pos.lat,
                  currentLng: pos.lng,
                  distanceKm: trueDist,
                  nextStationName: pos.nextStationName,
                  remainingStopsCount: pos.remainingStopsCount,
                  drRemainingSec: nextRemaining,
                  staticBaselineChecks: nextStaticChecks,
                }
              : prev
          );

          if (nextRemaining <= 0 && Date.now() > snoozeUntilRef.current) {
            fireTriggerAlarm('dead_reckoning_eta', trueDist);
          }
          return;
        }

        const etaMin = Math.max(1, Math.round((trueDist / speedKmh) * 60));
        setLiveState((prev) =>
          prev
            ? {
                ...prev,
                simProgress: nextProgress,
                currentLat: pos.lat,
                currentLng: pos.lng,
                distanceKm: trueDist,
                speedKmh,
                etaMinutes: etaMin,
                pollingZone: zoneInfo.zone,
                pollIntervalSec: zoneInfo.intervalSec,
                nextStationName: pos.nextStationName,
                remainingStopsCount: pos.remainingStopsCount,
                gpsChecksPerformed: nextGpsChecks,
                staticBaselineChecks: nextStaticChecks,
              }
            : prev
        );

        if (trueDist <= j.configured_alert_distance && Date.now() > snoozeUntilRef.current) {
          fireTriggerAlarm('gps_proximity', trueDist);
        }
      } else if (l.deadReckoningActive && l.drRemainingSec !== null) {
        const nextRemaining = Math.max(0, l.drRemainingSec - 1);
        setLiveState((prev) =>
          prev
            ? {
                ...prev,
                drRemainingSec: nextRemaining,
                staticBaselineChecks: nextStaticChecks,
              }
            : prev
        );
        if (nextRemaining <= 0 && Date.now() > snoozeUntilRef.current) {
          fireTriggerAlarm('dead_reckoning_eta', l.distanceKm);
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [appendLog, fireTriggerAlarm]);

  const handleStopAndSaveJourney = (
    finalStatus: JourneyRecord['journey_status'],
    alertStatus?: JourneyRecord['alert_status']
  ) => {
    alertEngine.stopAlarm();
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
      appendLog('info', `Journey ended (${finalStatus}) · Battery saved: ${savedPct}%`);
    }

    setActiveJourney(null);
    setLiveState(null);
  };

  const handleSnoozeAlarm = () => {
    alertEngine.stopAlarm();
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
      const totalKm = Math.max(
        2,
        haversineDistanceKm(j.start_lat, j.start_lng, j.destination_lat, j.destination_lng)
      );
      const targetDist = j.configured_alert_distance + 0.65;
      const targetProgress = Math.min(0.96, Math.max(0.1, 1 - targetDist / totalKm));
      const pos = interpolateStations(simWaypointsRef.current, targetProgress);
      const actualDist = haversineDistanceKm(pos.lat, pos.lng, j.destination_lat, j.destination_lng);
      const z = getPollingZoneInfo(actualDist);

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
              nextStationName: pos.nextStationName,
              remainingStopsCount: pos.remainingStopsCount,
              simSpeedMultiplier: 5,
            }
          : prev
      );
      appendLog('zone_change', `Jumped near approach (${actualDist.toFixed(2)} km) — ${z.label}`);
    }
  };

  const handleTestFullAlarm = () => {
    alertEngine.unlockAudio();
    const dummyDest = destinations[0];
    if (!activeJourney) {
      alertEngine.triggerAlarm({
        destinationName: dummyDest?.destination_name || 'Dadar Station',
        distanceKm: 1.4,
        isFallback: false,
        prefs: user.preferences,
      });
      window.setTimeout(() => alertEngine.stopAlarm(), 4500);
      appendLog('alert', 'Ran 4.5s sound, vibration, and voice alarm self-test');
    } else {
      fireTriggerAlarm('gps_proximity', liveState?.distanceKm || 1.2);
    }
  };

  // Determine Map Props based on current screen & journey state
  const mapProps = useMemo(() => {
    if (activeJourney && liveState) {
      const preset = MUMBAI_PRESET_ROUTES.find((r) => r.id === activeJourney.route_id);
      const waypoints = preset
        ? preset.stationIds
            .map((id) => getStationById(id))
            .filter((s): s is NonNullable<typeof s> => Boolean(s))
            .map((s) => ({ name: s.name, lat: s.lat, lng: s.lng }))
        : [
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
      return {
        centerLat: liveState.currentLat,
        centerLng: liveState.currentLng,
        userLat: liveState.currentLat,
        userLng: liveState.currentLng,
        destLat: activeJourney.destination_lat,
        destLng: activeJourney.destination_lng,
        destName: activeJourney.destination_name,
        alertRadiusKm: activeJourney.configured_alert_distance,
        routeWaypoints: waypoints,
        showMumbaiNetwork: false,
        isDeadReckoning: liveState.deadReckoningActive,
        isAlerting: activeJourney.journey_status === 'alerting',
        interactivePinMode: false,
        zoom: 12,
      };
    }

    if (tab === 'add') {
      return {
        centerLat: pickedCoords.lat,
        centerLng: pickedCoords.lng,
        destLat: pickedCoords.lat,
        destLng: pickedCoords.lng,
        destName: 'Selected Pin',
        alertRadiusKm: 1.5,
        routeWaypoints: [],
        showMumbaiNetwork: true,
        isDeadReckoning: false,
        isAlerting: false,
        interactivePinMode: true,
        zoom: 12,
      };
    }

    const focusDest = selectedDestination || previewDestination || destinations[0];
    return {
      centerLat: focusDest?.latitude ?? 19.085,
      centerLng: focusDest?.longitude ?? 72.91,
      destLat: focusDest?.latitude,
      destLng: focusDest?.longitude,
      destName: focusDest?.destination_name,
      alertRadiusKm: user.preferences.defaultAlertRadiusKm,
      routeWaypoints: [],
      showMumbaiNetwork: true,
      isDeadReckoning: false,
      isAlerting: false,
      interactivePinMode: false,
      zoom: 11,
    };
  }, [
    activeJourney,
    liveState,
    tab,
    pickedCoords,
    selectedDestination,
    previewDestination,
    destinations,
    user.preferences.defaultAlertRadiusKm,
  ]);

  const navItems = [
    { id: 'home' as const, label: 'Explore', icon: Home },
    { id: 'add' as const, label: 'Add Stop', icon: PlusCircle },
    { id: 'journey' as const, label: activeJourney ? 'Active' : 'Journey', icon: Compass },
    { id: 'settings' as const, label: 'Telemetry', icon: Settings },
  ];

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-[#05070b] text-slate-100 lg:flex-row">
      {/* ============================================================
          PERSISTENT MAP STAGE (Top hero on Mobile, Left Split on Desktop)
         ============================================================ */}
      <div className="relative h-[37dvh] w-full shrink-0 lg:h-full lg:flex-1">
        <LiveMap
          {...mapProps}
          savedDestinations={destinations}
          onMapClick={
            tab === 'add' ? (lat, lng) => setPickedCoords({ lat, lng }) : undefined
          }
          onSelectDestinationPin={(dest) => {
            setPreviewDestination(dest);
          }}
          className="h-full w-full"
        />

        {/* Floating Top Brand + Signal Pill + Profile Pill */}
        <div className="pointer-events-none absolute inset-x-3.5 top-3.5 z-30 flex items-center justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-white/10 bg-[#0b101c]/90 py-1.5 pl-2 pr-3.5 shadow-xl backdrop-blur-xl">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 text-slate-950">
              <Navigation className="h-3.5 w-3.5" />
            </span>
            <span className="text-sm font-extrabold tracking-tight text-white">WakeMe</span>
            <span className="h-3.5 w-px bg-white/15" />
            {liveState?.deadReckoningActive ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                <WifiOff className="h-3 w-3" />
                Fallback
              </span>
            ) : activeJourney ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <Radio className="h-3 w-3 animate-pulse" />
                Armed
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-300">Mumbai Transit</span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAuthModalOpen(true)}
            className="pressable pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#0b101c]/90 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-xl backdrop-blur-xl hover:border-cyan-400/40"
          >
            <User className="h-3.5 w-3.5 text-cyan-300" />
            <span className="max-w-[96px] truncate">{user.name.split(' ')[0]}</span>
          </button>
        </div>

        {/* Desktop Map Bottom Legend (hidden on small screens so bottom sheet overlaps cleanly) */}
        {!activeJourney && (
          <div className="pointer-events-none absolute bottom-4 left-4 z-20 hidden items-center gap-2 rounded-full border border-white/10 bg-[#0b101c]/88 px-3.5 py-2 text-xs shadow-xl backdrop-blur-xl lg:inline-flex">
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Central
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              Western
            </span>
            <span className="h-3 w-px bg-white/10" />
            <span className="inline-flex items-center gap-1.5 text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Harbour
            </span>
          </div>
        )}
      </div>

      {/* ============================================================
          COMMUTER CONTROL SHEET (Bottom Sheet on Mobile, Docked Rail on Desktop)
         ============================================================ */}
      <aside className="relative z-30 -mt-5 flex min-h-0 flex-1 flex-col rounded-t-[26px] border-t border-white/10 bg-[#080c16]/95 shadow-[0_-14px_40px_rgba(0,0,0,0.65)] backdrop-blur-2xl lg:mt-0 lg:w-[440px] lg:shrink-0 lg:rounded-none lg:border-l lg:border-t-0 lg:bg-[#080c16] lg:shadow-none xl:w-[468px]">
        {/* Mobile Grabber Pill */}
        <div className="flex justify-center pb-1 pt-2.5 lg:hidden">
          <span className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Scrollable Content Region */}
        <main className="clean-scroll flex-1 overflow-y-auto px-4 pb-6 pt-2 lg:px-6 lg:pt-6">
          {tab === 'home' && (
            <HomeScreen
              destinations={destinations}
              hasActiveJourney={Boolean(activeJourney)}
              previewDestinationId={previewDestination?.destination_id}
              onGoToAdd={() => setTab('add')}
              onPreviewDestination={(dest) => setPreviewDestination(dest)}
              onStartWithDestination={(dest) => {
                setSelectedDestination(dest);
                setSelectedPresetRoute(null);
                setPreviewDestination(dest);
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
              userId={user.user_id}
              pickedLat={pickedCoords.lat}
              pickedLng={pickedCoords.lng}
              onUpdatePickedCoords={(lat, lng) => setPickedCoords({ lat, lng })}
              onBack={() => setTab('home')}
              onSaveDestination={handleSaveNewDestination}
            />
          )}

          {tab === 'journey' && (
            <JourneyScreen
              destinations={destinations}
              preferences={user.preferences}
              selectedDestination={selectedDestination}
              selectedPresetRoute={selectedPresetRoute}
              activeJourney={activeJourney}
              liveState={liveState}
              onStartJourney={handleStartJourney}
              onPauseResume={() =>
                setActiveJourney((prev) =>
                  prev
                    ? {
                        ...prev,
                        journey_status: prev.journey_status === 'paused' ? 'active' : 'paused',
                      }
                    : prev
                )
              }
              onStopJourney={() => handleStopAndSaveJourney('cancelled')}
              onSimulateSignalDrop={handleSimulateSignalDrop}
              onRestoreSignal={handleRestoreSignal}
              onChangeSimSpeed={(mult) =>
                setLiveState((prev) => (prev ? { ...prev, simSpeedMultiplier: mult } : prev))
              }
              onJumpNearAlert={handleJumpNearAlert}
              onForceTestAlarm={() =>
                fireTriggerAlarm(
                  liveState?.deadReckoningActive ? 'dead_reckoning_eta' : 'gps_proximity',
                  liveState?.distanceKm ?? 1.2
                )
              }
              onUpdateAlertRadius={(km) =>
                setActiveJourney((prev) =>
                  prev ? { ...prev, configured_alert_distance: km } : prev
                )
              }
            />
          )}

          {tab === 'settings' && (
            <SettingsTelemetryScreen
              preferences={user.preferences}
              journeys={journeys}
              telemetryLogs={telemetryLogs}
              onUpdatePreferences={handleUpdatePreferences}
              onTestFullAlarm={handleTestFullAlarm}
              onClearLogs={() => {
                setTelemetryLogs([]);
                saveTelemetryLogs([]);
              }}
            />
          )}
        </main>

        {/* Bottom Dock Navigation (Docked cleanly at bottom of sheet/rail) */}
        <nav className="shrink-0 border-t border-white/[0.08] bg-[#070b14]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl">
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
                      ? 'bg-cyan-400/12 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.id === 'journey' && activeJourney && (
                    <span className="absolute right-5 top-2 h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  )}
                  <Icon className={`h-5 w-5 ${active ? 'stroke-[2.3]' : 'stroke-[1.8]'}`} />
                  <span className="text-[11px] font-semibold">{item.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      </aside>

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
          distanceKm={liveState.distanceKm}
          isFallbackTrigger={activeJourney.alert_status === 'dead_reckoning_eta'}
          voiceLang={user.preferences.voiceLanguage}
          onSnooze={handleSnoozeAlarm}
          onDismiss={() => handleStopAndSaveJourney('completed', 'dismissed')}
        />
      )}
    </div>
  );
}

export default App;
