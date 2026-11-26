import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  Activity,
  BatteryCharging,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cloud,
  Compass,
  Database,
  Download,
  History,
  Moon,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Square,
  Sun,
  Trash2,
  Volume2,
  Wifi,
} from 'lucide-react';
import { alertEngine } from '../services/alertEngine';
import { getCurrentPositionUnified } from '../services/nativeGeo';
import {
  StartupPermissionReadiness,
  checkStartupPermissionReadiness,
  openAndroidAppSettings,
  requestBatteryOptimizationExemption,
  requestNativeLocationPermission,
} from '../services/nativePermissions';
import {
  AlertLanguage,
  JourneyRecord,
  TelemetryLogEntry,
  UserPreferences,
} from '../types/wakeme';

interface SettingsTelemetryScreenProps {
  preferences: UserPreferences;
  savedPlacesCount: number;
  journeys: JourneyRecord[];
  telemetryLogs: TelemetryLogEntry[];
  canInstallPwa?: boolean;
  onInstallPwa?: () => Promise<void> | void;
  onUpdatePreferences: (updated: UserPreferences) => void;
  onTestFullAlarm: () => void;
  onStopTestAlarm: () => void;
  onClearLogs: () => void;
  onClearHistory: () => void;
  onResetDefaults: () => void;
}

interface SwitchRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  badge?: string;
}

const SwitchRow: React.FC<SwitchRowProps> = ({
  label,
  description,
  checked,
  onChange,
  badge,
}) => (
  <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
        {badge && (
          <span className="rounded-md bg-[#edf1f7] px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-[#1c2331] dark:text-slate-300">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </div>

    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`pressable relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors ${
        checked
          ? 'bg-blue-600 dark:bg-blue-500'
          : 'bg-slate-200 dark:bg-[#1c2331]'
      }`}
    >
      <span
        className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

export const SettingsTelemetryScreen: React.FC<SettingsTelemetryScreenProps> = ({
  preferences,
  savedPlacesCount,
  journeys,
  telemetryLogs,
  canInstallPwa = false,
  onInstallPwa,
  onUpdatePreferences,
  onTestFullAlarm,
  onStopTestAlarm,
  onClearLogs,
  onClearHistory,
  onResetDefaults,
}) => {
  const [testingAlarm, setTestingAlarm] = useState(false);
  const [permMessage, setPermMessage] = useState<string | null>(null);
  const [diagVersion, setDiagVersion] = useState(0);
  const [showOemGuide, setShowOemGuide] = useState(false);
  const [showTelemetry, setShowTelemetry] = useState(true);
  const [showSupabase, setShowSupabase] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [exportNote, setExportNote] = useState<string | null>(null);
  const [nativeReadiness, setNativeReadiness] = useState<StartupPermissionReadiness | null>(null);
  const testTimerRef = useRef<number | null>(null);

  useEffect(() => {
    void checkStartupPermissionReadiness().then(setNativeReadiness);
    return () => {
      if (testTimerRef.current !== null) clearTimeout(testTimerRef.current);
    };
  }, []);

  const diag = useMemo(() => {
    void diagVersion;
    return alertEngine.getDiagnostics();
  }, [diagVersion]);

  const tripStats = useMemo(() => {
    const total = journeys.length;
    const avgBattery =
      total > 0
        ? Math.round(
            journeys.reduce((acc, j) => acc + (j.estimated_battery_saved_pct || 0), 0) / total
          )
        : 0;
    const dropsHandled = journeys.reduce((acc, j) => acc + (j.signal_drops_count || 0), 0);
    return { total, avgBattery, dropsHandled };
  }, [journeys]);

  const handleRequestPermissions = async () => {
    alertEngine.unlockAudio();
    const loc = await requestNativeLocationPermission();
    const notif = await alertEngine.requestNotificationPermission();
    if (Capacitor.isNativePlatform()) {
      await requestBatteryOptimizationExemption();
    }
    const updated = await checkStartupPermissionReadiness();
    setNativeReadiness(updated);
    let geoNote = loc === 'granted' ? 'GPS Permitted' : 'GPS Permission Denied';
    if (diag.geolocationSupported && loc === 'granted') {
      try {
        await getCurrentPositionUnified(4000);
        geoNote = 'GPS Locked';
      } catch (err: unknown) {
        const code = (err as { code?: number })?.code;
        geoNote = code === 1 ? 'GPS Permission Denied' : 'GPS Standby / Indoors';
      }
    } else if (!diag.geolocationSupported) {
      geoNote = 'GPS unsupported';
    }
    setDiagVersion((v) => v + 1);
    setPermMessage(
      `Audio unlocked · Notifications: ${notif} · ${geoNote}${
        updated.isNative
          ? updated.batteryUnrestricted
            ? ' · Battery Unrestricted'
            : ' · Battery Optimized'
          : ''
      }`
    );
  };

  const handleRunTestAlarm = () => {
    if (testTimerRef.current !== null) {
      clearTimeout(testTimerRef.current);
      testTimerRef.current = null;
    }
    if (testingAlarm) {
      onStopTestAlarm();
      setTestingAlarm(false);
      setDiagVersion((v) => v + 1);
      return;
    }
    setTestingAlarm(true);
    onTestFullAlarm();
    setDiagVersion((v) => v + 1);
    testTimerRef.current = window.setTimeout(() => {
      testTimerRef.current = null;
      setTestingAlarm(false);
      setDiagVersion((v) => v + 1);
    }, 4600);
  };

  const handleExportLogs = () => {
    try {
      const jsonStr = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          preferences: { ...preferences, supabaseAnonKey: undefined },
          telemetryLogs,
          journeys,
        },
        null,
        2
      );
      if (Capacitor.isNativePlatform()) {
        if (navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(jsonStr).then(() => {
            setExportNote('Telemetry JSON copied to clipboard');
            window.setTimeout(() => setExportNote(null), 3000);
          });
        }
        return;
      }
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wakeme-telemetry-${Date.now()}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // Ignore export issues
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-[-0.025em] text-slate-900 dark:text-white">
            Settings
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Alarm reliability, Dead-Reckoning tuning, and field telemetry.
          </p>
        </div>
        {canInstallPwa && onInstallPwa && (
          <button
            type="button"
            onClick={() => void onInstallPwa()}
            className="pressable inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-xs dark:bg-blue-500"
          >
            <Download className="h-3.5 w-3.5" />
            Install App
          </button>
        )}
      </header>

      {/* SECTION 1: Appearance & Trip Defaults */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">Appearance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Syncs app &amp; OpenFreeMap vector theme
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-[#edf1f7] p-1 dark:bg-[#0a0d12]">
            <button
              type="button"
              onClick={() => onUpdatePreferences({ ...preferences, theme: 'light' })}
              className={`pressable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                preferences.theme === 'light'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Sun className="h-3.5 w-3.5 text-amber-500" />
              Light
            </button>
            <button
              type="button"
              onClick={() => onUpdatePreferences({ ...preferences, theme: 'dark' })}
              className={`pressable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${
                preferences.theme === 'dark'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              Dark
            </button>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Default wake-up alert radius
            </span>
            <span className="font-mono-num rounded-lg bg-blue-50 px-2 py-0.5 font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
              {preferences.defaultAlertRadiusKm.toFixed(1)} km
            </span>
          </div>
          <div className="mb-2 flex gap-1.5">
            {[1.5, 2.0, 5.0, 8.0].map((km) => (
              <button
                key={km}
                type="button"
                onClick={() =>
                  onUpdatePreferences({ ...preferences, defaultAlertRadiusKm: km })
                }
                className={`pressable flex-1 rounded-lg py-1.5 text-xs font-bold ${
                  Math.abs(preferences.defaultAlertRadiusKm - km) < 0.05
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
            value={preferences.defaultAlertRadiusKm}
            onChange={(e) =>
              onUpdatePreferences({
                ...preferences,
                defaultAlertRadiusKm: Number(e.target.value),
              })
            }
            aria-label="Default wake-up alert radius in kilometers"
            className="w-full accent-blue-600 dark:accent-blue-500"
          />
        </div>
      </section>

      {/* SECTION 2: Alarm, Sound & Vibration Controls */}
      <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Volume2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Alarm, sound &amp; vibration
          </h2>
          <button
            type="button"
            onClick={handleRunTestAlarm}
            className={`pressable inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold ${
              testingAlarm
                ? 'border-rose-400 bg-rose-600 text-white'
                : 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-200'
            }`}
          >
            {testingAlarm ? (
              <>
                <Square className="h-3 w-3 fill-white" />
                Stop Test
              </>
            ) : (
              <>
                <BellRing className="h-3.5 w-3.5" />
                Test Alarm
              </>
            )}
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          <SwitchRow
            label="Loud Alarm Siren"
            description="Synthesized dual-siren + looping offline WAV chime"
            checked={preferences.soundEnabled}
            onChange={(val) => onUpdatePreferences({ ...preferences, soundEnabled: val })}
          />
          <SwitchRow
            label="Vibration Pulse"
            description="Continuous haptic bursts while approaching stop"
            badge={diag.vibrationSupported ? 'API Ready' : 'Mobile Only'}
            checked={preferences.vibrationEnabled}
            onChange={(val) => onUpdatePreferences({ ...preferences, vibrationEnabled: val })}
          />
          <SwitchRow
            label="Voice Announcement (TTS)"
            description="Speaks station name & remaining km hands-free"
            checked={preferences.voiceAlertEnabled}
            onChange={(val) => onUpdatePreferences({ ...preferences, voiceAlertEnabled: val })}
          />
          <SwitchRow
            label="Repeat Voice Loop"
            description="Repeats spoken wake call until snoozed or dismissed"
            checked={preferences.repeatAlertEnabled}
            onChange={(val) => onUpdatePreferences({ ...preferences, repeatAlertEnabled: val })}
          />
        </div>

        {/* Master Alarm Volume */}
        <div className="border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Siren volume gain
            </span>
            <span className="font-mono-num font-bold text-slate-900 dark:text-white">
              {Math.round(preferences.alarmVolume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.3}
            max={1.0}
            step={0.05}
            value={preferences.alarmVolume}
            onChange={(e) =>
              onUpdatePreferences({
                ...preferences,
                alarmVolume: Number(e.target.value),
              })
            }
            aria-label="Siren volume gain"
            className="w-full accent-blue-600 dark:accent-blue-500"
          />
        </div>

        {/* Voice Language + Repeat Interval */}
        <div className="space-y-3 border-t border-slate-100 pt-3.5 dark:border-white/[0.07]">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Voice alert language
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'hi', label: 'हिंदी' },
                  { id: 'mr', label: 'मराठी' },
                ] as Array<{ id: AlertLanguage; label: string }>
              ).map((lang) => (
                <button
                  key={lang.id}
                  type="button"
                  onClick={() => onUpdatePreferences({ ...preferences, voiceLanguage: lang.id })}
                  className={`pressable rounded-xl border py-2 text-xs font-bold ${
                    preferences.voiceLanguage === lang.id
                      ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                      : 'border-slate-200 bg-[#f5f7fa] text-slate-600 dark:border-white/[0.08] dark:bg-[#0a0d12] dark:text-slate-300'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          </div>

          {preferences.repeatAlertEnabled && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Repeat voice interval
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {[10, 20, 30, 45].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() =>
                      onUpdatePreferences({ ...preferences, repeatIntervalSec: sec })
                    }
                    className={`pressable rounded-lg py-1.5 text-xs font-bold ${
                      preferences.repeatIntervalSec === sec
                        ? 'bg-blue-600 text-white dark:bg-blue-500'
                        : 'bg-[#edf1f7] text-slate-600 dark:bg-[#1c2331] dark:text-slate-300'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 3: Dead-Reckoning & Adaptive GPS Engine */}
      <section className="space-y-3.5 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 text-amber-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Dead-Reckoning &amp; battery zones
          </h2>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Stops dwell buffer (per station)
            </span>
            <span className="font-mono-num font-bold text-amber-700 dark:text-amber-300">
              +{preferences.stopBufferMinutesPerStop.toFixed(1)} min/stop
            </span>
          </div>
          <div className="mb-2 flex gap-1.5">
            {[1.0, 2.0, 3.0, 4.0].map((minVal) => (
              <button
                key={minVal}
                type="button"
                onClick={() =>
                  onUpdatePreferences({ ...preferences, stopBufferMinutesPerStop: minVal })
                }
                className={`pressable flex-1 rounded-lg py-1.5 text-xs font-bold ${
                  Math.abs(preferences.stopBufferMinutesPerStop - minVal) < 0.05
                    ? 'bg-amber-500 text-white'
                    : 'bg-[#edf1f7] text-slate-600 dark:bg-[#1c2331] dark:text-slate-300'
                }`}
              >
                +{minVal}m
              </button>
            ))}
          </div>
          <input
            type="range"
            min={0.5}
            max={5.0}
            step={0.5}
            value={preferences.stopBufferMinutesPerStop}
            onChange={(e) =>
              onUpdatePreferences({
                ...preferences,
                stopBufferMinutesPerStop: Number(e.target.value),
              })
            }
            aria-label="Stops dwell buffer in minutes per stop"
            className="w-full accent-amber-500"
          />
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            In signal loss with 3 upcoming stops, WakeMe adds{' '}
            <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-200">
              +{(3 * preferences.stopBufferMinutesPerStop).toFixed(1)}m
            </span>{' '}
            to prevent early false alarms.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center text-[11px] dark:border-white/[0.07]">
          <div className="rounded-xl bg-[#f5f7fa] p-2 dark:bg-[#0a0d12]">
            <p className="font-bold text-emerald-600 dark:text-emerald-400">Eco 60s</p>
            <p className="mt-0.5 text-slate-500">&gt;15 km away</p>
          </div>
          <div className="rounded-xl bg-[#f5f7fa] p-2 dark:bg-[#0a0d12]">
            <p className="font-bold text-blue-600 dark:text-blue-400">Balanced 20s</p>
            <p className="mt-0.5 text-slate-500">3–15 km away</p>
          </div>
          <div className="rounded-xl bg-[#f5f7fa] p-2 dark:bg-[#0a0d12]">
            <p className="font-bold text-rose-600 dark:text-rose-400">Precision 3s</p>
            <p className="mt-0.5 text-slate-500">&lt;3 km zone</p>
          </div>
        </div>
      </section>

      {/* SECTION 4: Hardware Diagnostics & Mobile Reliability Guide */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Device readiness
          </h2>
          <button
            type="button"
            onClick={handleRequestPermissions}
            className="pressable rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300"
          >
            Unlock &amp; Grant
          </button>
        </div>

        {permMessage && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">
            {permMessage}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 dark:bg-[#0a0d12]">
            <span className="truncate text-slate-500 dark:text-slate-400">GPS API</span>
            <span className={diag.geolocationSupported ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400' : 'shrink-0 font-bold text-rose-500'}>
              {diag.geolocationSupported ? 'Ready' : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 dark:bg-[#0a0d12]">
            <span className="truncate text-slate-500 dark:text-slate-400">Web Audio</span>
            <span className={diag.audioContextSupported ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400' : 'shrink-0 text-amber-500'}>
              {diag.audioContextState === 'running' ? 'Unlocked' : diag.audioContextSupported ? 'Ready' : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 dark:bg-[#0a0d12]">
            <span className="truncate text-slate-500 dark:text-slate-400">Notifs</span>
            <span className={diag.notificationPermission === 'granted' ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400' : 'shrink-0 font-bold text-amber-600 dark:text-amber-400'}>
              {diag.notificationPermission}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 dark:bg-[#0a0d12]">
            <span className="truncate text-slate-500 dark:text-slate-400">Vibration</span>
            <span className={diag.vibrationSupported ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400' : 'shrink-0 text-slate-400'}>
              {diag.vibrationSupported ? 'Ready' : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 dark:bg-[#0a0d12]">
            <span className="text-slate-500 dark:text-slate-400">Wake Lock</span>
            <span className={diag.wakeLockSupported ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400' : 'shrink-0 text-slate-400'}>
              {diag.wakeLockSupported ? 'Ready' : 'Fallback'}
            </span>
          </div>
          <div className="flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 dark:bg-[#0a0d12]">
            <span className="truncate text-slate-500 dark:text-slate-400">Voice TTS</span>
            <span className={diag.speechSynthesisSupported ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400' : 'shrink-0 text-slate-400'}>
              {diag.speechSynthesisSupported ? `${diag.voicesCount || 'Ready'}` : 'Off'}
            </span>
          </div>
          {Capacitor.isNativePlatform() && nativeReadiness && (
            <>
              <button
                type="button"
                onClick={async () => {
                  await requestBatteryOptimizationExemption();
                  setNativeReadiness(await checkStartupPermissionReadiness());
                }}
                className="pressable flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 text-left dark:bg-[#0a0d12]"
              >
                <span className="truncate text-slate-500 dark:text-slate-400">Battery</span>
                <span
                  className={
                    nativeReadiness.batteryUnrestricted
                      ? 'shrink-0 font-bold text-emerald-600 dark:text-emerald-400'
                      : 'shrink-0 font-bold text-amber-600 dark:text-amber-400'
                  }
                >
                  {nativeReadiness.batteryUnrestricted ? 'Unrestricted' : 'Tap Allow'}
                </span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  setNativeReadiness(await openAndroidAppSettings());
                  setDiagVersion((v) => v + 1);
                }}
                className="pressable flex items-center justify-between gap-1.5 rounded-xl bg-[#f5f7fa] px-2.5 py-2 text-left dark:bg-[#0a0d12]"
              >
                <span className="truncate text-slate-500 dark:text-slate-400">App Info</span>
                <span className="shrink-0 font-bold text-blue-600 dark:text-blue-400">Settings</span>
              </button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowOemGuide((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl bg-[#f5f7fa] px-3 py-2.5 text-left text-xs font-semibold text-slate-700 dark:bg-[#0a0d12] dark:text-slate-200"
        >
          <span className="inline-flex items-center gap-2">
            <Smartphone className="h-3.5 w-3.5 text-amber-500" />
            Android &amp; iOS alarm reliability checklist
          </span>
          {showOemGuide ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </button>

        {showOemGuide && (
          <div className="space-y-2 rounded-xl border border-slate-100 bg-[#f5f7fa] p-3 text-xs leading-relaxed text-slate-600 dark:border-white/[0.06] dark:bg-[#0a0d12] dark:text-slate-300">
            <p>
              <strong className="text-slate-900 dark:text-white">Android Chrome:</strong> Keep WakeMe open (Screen Wake Lock keeps the screen dim-awake) and set Chrome Battery to <em>Unrestricted</em> on Xiaomi/Samsung/Realme. Silent MediaSession track protects short switches.
            </p>
            <p>
              <strong className="text-slate-900 dark:text-white">iPhone / iOS Safari:</strong> Audio &amp; Voice TTS play cleanly after tapping <em>Start Trip</em>, but Apple blocks the Web Vibration API across all iOS browsers — raise ringer/media volume instead.
            </p>
          </div>
        )}
      </section>

      {/* SECTION 5: Telemetry, History & Offline Data */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-[#f5f7fa] p-2.5 dark:bg-[#0a0d12]">
            <p className="font-mono-num text-base font-extrabold text-slate-900 dark:text-white">
              {tripStats.total}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Trips logged</p>
          </div>
          <div className="rounded-xl bg-[#f5f7fa] p-2.5 dark:bg-[#0a0d12]">
            <p className="font-mono-num text-base font-extrabold text-emerald-600 dark:text-emerald-400">
              {tripStats.avgBattery}%
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Avg saved</p>
          </div>
          <div className="rounded-xl bg-[#f5f7fa] p-2.5 dark:bg-[#0a0d12]">
            <p className="font-mono-num text-base font-extrabold text-amber-600 dark:text-amber-400">
              {tripStats.dropsHandled}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Drops handled</p>
          </div>
        </div>

        {/* Field Telemetry Logs */}
        <div className="border-t border-slate-100 pt-3 dark:border-white/[0.07]">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowTelemetry((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white"
            >
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Field telemetry ({telemetryLogs.length})
              {showTelemetry ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
            </button>
            <div className="flex items-center gap-3 text-xs">
              {telemetryLogs.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={handleExportLogs}
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Export JSON
                  </button>
                  <button
                    type="button"
                    onClick={onClearLogs}
                    className="font-medium text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
          </div>

          {showTelemetry && (
            <div className="clean-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
              {exportNote && (
                <p className="rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                  {exportNote}
                </p>
              )}
              {telemetryLogs.length === 0 ? (
                <p className="rounded-xl bg-[#f5f7fa] p-3 text-center text-xs text-slate-500 dark:bg-[#0a0d12]">
                  Run a Demo or GPS trip to log Polling Zones, Signal Drops, and Re-locks.
                </p>
              ) : (
                telemetryLogs.map((log) => {
                  const tone =
                    log.type === 'signal_lost'
                      ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/35 dark:bg-[#0a0d12] dark:text-amber-200'
                      : log.type === 'signal_restored'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/35 dark:bg-[#0a0d12] dark:text-emerald-200'
                      : log.type === 'alert'
                      ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/35 dark:bg-[#0a0d12] dark:text-rose-200'
                      : 'border-slate-200 bg-[#f5f7fa] text-slate-700 dark:border-white/[0.06] dark:bg-[#0a0d12] dark:text-slate-300';
                  return (
                    <div key={log.id} className={`rounded-xl border px-3 py-2 text-xs ${tone}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{log.message}</span>
                        <span className="font-mono-num shrink-0 text-[10px] opacity-65">
                          {new Date(log.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Trip History */}
        <div className="border-t border-slate-100 pt-3 dark:border-white/[0.07]">
          <div className="mb-2 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
              <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              Recent trip history ({journeys.length})
            </span>
            {journeys.length > 0 && (
              <button
                type="button"
                onClick={onClearHistory}
                className="text-xs font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
              >
                Clear history
              </button>
            )}
          </div>

          {journeys.length === 0 ? (
            <p className="rounded-xl bg-[#f5f7fa] p-3 text-center text-xs text-slate-500 dark:bg-[#0a0d12]">
              Completed and ended trips appear here automatically.
            </p>
          ) : (
            <div className="space-y-2">
              {journeys.slice(0, 5).map((j) => (
                <div
                  key={j.journey_id}
                  className="rounded-xl border border-slate-200/80 bg-[#f5f7fa] p-3 dark:border-white/[0.06] dark:bg-[#0a0d12]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                      {j.start_location_name} → {j.destination_name}
                    </p>
                    <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-blue-600 dark:bg-[#1c2331] dark:text-blue-300">
                      {j.alert_status}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <BatteryCharging className="h-3 w-3 text-emerald-500" />
                      {j.estimated_battery_saved_pct}% saved
                    </span>
                    <span>Alert @ {j.configured_alert_distance} km</span>
                    <span>Drops: {j.signal_drops_count}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Optional Cloud Sync & Offline Cache Reset */}
        <div className="space-y-3 border-t border-slate-100 pt-3 dark:border-white/[0.07]">
          <button
            type="button"
            onClick={() => setShowSupabase((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2.5">
              <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Offline cache ({savedPlacesCount} places) &amp; cloud sync
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {preferences.supabaseUrl ? 'Supabase sync enabled' : '100% offline local storage'}
                </p>
              </div>
            </div>
            {preferences.supabaseUrl ? (
              <Cloud className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            ) : (
              <Wifi className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showSupabase && (
            <div className="space-y-2.5 rounded-xl bg-[#f5f7fa] p-3 dark:bg-[#0a0d12]">
              <input
                type="text"
                value={preferences.supabaseUrl || ''}
                onChange={(e) =>
                  onUpdatePreferences({ ...preferences, supabaseUrl: e.target.value })
                }
                placeholder="Supabase Project URL (https://xxx.supabase.co)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-xs dark:border-white/10 dark:bg-[#141923] dark:text-white"
              />
              <input
                type="password"
                value={preferences.supabaseAnonKey || ''}
                onChange={(e) =>
                  onUpdatePreferences({ ...preferences, supabaseAnonKey: e.target.value })
                }
                placeholder="Supabase Anon Key (optional)"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-xs dark:border-white/10 dark:bg-[#141923] dark:text-white"
              />
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                Works offline even without cloud sync.
              </p>
            </div>
          )}

          {!confirmReset ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-[#f5f7fa] py-2.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600 dark:border-white/[0.08] dark:bg-[#0a0d12] dark:text-slate-300"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore default routes &amp; preferences
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 dark:border-rose-400/35 dark:bg-rose-500/15">
              <span className="flex-1 text-xs font-semibold text-rose-800 dark:text-rose-200">
                Reset saved defaults?
              </span>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-[#141923] dark:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onResetDefaults();
                  setConfirmReset(false);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-bold text-white"
              >
                <Trash2 className="h-3 w-3" />
                Reset
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
