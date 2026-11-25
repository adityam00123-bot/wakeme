import React, { useState } from 'react';
import {
  BatteryCharging,
  BellRing,
  CheckCircle2,
  Cloud,
  Database,
  History,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
  Volume2,
  Wifi,
} from 'lucide-react';
import { alertEngine } from '../services/alertEngine';
import {
  AlertLanguage,
  JourneyRecord,
  TelemetryLogEntry,
  UserPreferences,
} from '../types/wakeme';

interface SettingsTelemetryScreenProps {
  preferences: UserPreferences;
  journeys: JourneyRecord[];
  telemetryLogs: TelemetryLogEntry[];
  onUpdatePreferences: (updated: UserPreferences) => void;
  onTestFullAlarm: () => void;
  onClearLogs: () => void;
}

export const SettingsTelemetryScreen: React.FC<SettingsTelemetryScreenProps> = ({
  preferences,
  journeys,
  telemetryLogs,
  onUpdatePreferences,
  onTestFullAlarm,
  onClearLogs,
}) => {
  const [showSupabase, setShowSupabase] = useState(false);
  const [permMessage, setPermMessage] = useState<string | null>(null);

  const notifStatus =
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported';
  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const vibrationSupported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  const geoSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  const handleRequestPermissions = async () => {
    alertEngine.unlockAudio();
    const notif = await alertEngine.requestNotificationPermission();
    let geoNote = 'GPS Checked';
    if (geoSupported) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => {},
        { timeout: 3000 }
      );
    } else {
      geoNote = 'GPS unsupported';
    }
    setPermMessage(`Notifications: ${notif} · ${geoNote}`);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold tracking-[-0.025em] text-slate-900 dark:text-white">
          Settings
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Appearance, alert preferences, device health, and field logs.
        </p>
      </header>

      {/* Appearance Switcher (Light / Dark) */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Switches app &amp; map style together
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-[#edf1f7] p-1 dark:bg-[#0a0d12]">
            <button
              type="button"
              onClick={() => onUpdatePreferences({ ...preferences, theme: 'light' })}
              className={`pressable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
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
              className={`pressable inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
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
      </section>

      {/* Smart Alert Preferences */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Volume2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Smart alert preferences
          </h2>
          <button
            type="button"
            onClick={onTestFullAlarm}
            className="pressable inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-400/35 dark:bg-rose-500/15 dark:text-rose-200"
          >
            <BellRing className="h-3.5 w-3.5" />
            Test Alarm
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              onUpdatePreferences({ ...preferences, soundEnabled: !preferences.soundEnabled })
            }
            className={`pressable rounded-xl border p-3 text-left ${
              preferences.soundEnabled
                ? 'border-blue-500/40 bg-blue-50 text-slate-900 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-white'
                : 'border-slate-200 bg-[#f5f7fa] text-slate-500 dark:border-white/[0.07] dark:bg-[#0a0d12] dark:text-slate-400'
            }`}
          >
            <p className="text-xs font-semibold">Alarm Siren</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {preferences.soundEnabled ? 'Enabled' : 'Muted'}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePreferences({
                ...preferences,
                vibrationEnabled: !preferences.vibrationEnabled,
              })
            }
            className={`pressable rounded-xl border p-3 text-left ${
              preferences.vibrationEnabled
                ? 'border-blue-500/40 bg-blue-50 text-slate-900 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-white'
                : 'border-slate-200 bg-[#f5f7fa] text-slate-500 dark:border-white/[0.07] dark:bg-[#0a0d12] dark:text-slate-400'
            }`}
          >
            <p className="text-xs font-semibold">Vibration Pulse</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {preferences.vibrationEnabled ? 'Enabled' : 'Disabled'}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePreferences({
                ...preferences,
                voiceAlertEnabled: !preferences.voiceAlertEnabled,
              })
            }
            className={`pressable rounded-xl border p-3 text-left ${
              preferences.voiceAlertEnabled
                ? 'border-blue-500/40 bg-blue-50 text-slate-900 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-white'
                : 'border-slate-200 bg-[#f5f7fa] text-slate-500 dark:border-white/[0.07] dark:bg-[#0a0d12] dark:text-slate-400'
            }`}
          >
            <p className="text-xs font-semibold">Voice TTS Alert</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {preferences.voiceAlertEnabled ? 'Speaking' : 'Off'}
            </p>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePreferences({
                ...preferences,
                repeatAlertEnabled: !preferences.repeatAlertEnabled,
              })
            }
            className={`pressable rounded-xl border p-3 text-left ${
              preferences.repeatAlertEnabled
                ? 'border-blue-500/40 bg-blue-50 text-slate-900 dark:border-blue-400/40 dark:bg-blue-500/15 dark:text-white'
                : 'border-slate-200 bg-[#f5f7fa] text-slate-500 dark:border-white/[0.07] dark:bg-[#0a0d12] dark:text-slate-400'
            }`}
          >
            <p className="text-xs font-semibold">Repeat Alert</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {preferences.repeatAlertEnabled ? `Every ${preferences.repeatIntervalSec}s` : 'Once'}
            </p>
          </button>
        </div>

        <div className="pt-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Voice announcement language
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'en', label: 'English' },
                { id: 'hi', label: 'हिंदी (Hindi)' },
                { id: 'mr', label: 'मराठी (Marathi)' },
              ] as Array<{ id: AlertLanguage; label: string }>
            ).map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => onUpdatePreferences({ ...preferences, voiceLanguage: lang.id })}
                className={`pressable rounded-xl border py-2 text-xs font-semibold ${
                  preferences.voiceLanguage === lang.id
                    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-500'
                    : 'border-slate-200 bg-[#f5f7fa] text-slate-600 dark:border-white/[0.08] dark:bg-[#0a0d12] dark:text-slate-400'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Device Health & Battery Guide */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Permissions &amp; battery guide
          </h2>
          <button
            type="button"
            onClick={handleRequestPermissions}
            className="pressable rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
          >
            Check / Grant
          </button>
        </div>

        {permMessage && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{permMessage}</p>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
            <span className="text-slate-500 dark:text-slate-400">GPS API</span>
            <span className={geoSupported ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}>
              {geoSupported ? 'Ready' : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
            <span className="text-slate-500 dark:text-slate-400">Notifications</span>
            <span className={notifStatus === 'granted' ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
              {notifStatus}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
            <span className="text-slate-500 dark:text-slate-400">WakeLock</span>
            <span className={wakeLockSupported ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
              {wakeLockSupported ? 'Supported' : 'Fallback'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#f5f7fa] px-3 py-2 dark:bg-[#0a0d12]">
            <span className="text-slate-500 dark:text-slate-400">Vibration</span>
            <span className={vibrationSupported ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
              {vibrationSupported ? 'Ready' : 'Desktop'}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-slate-100 bg-[#f5f7fa] p-3 text-xs text-slate-600 dark:border-white/[0.06] dark:bg-[#0a0d12] dark:text-slate-300">
          <p className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <Smartphone className="h-3.5 w-3.5 text-amber-500" />
            Android OEM checklist (MIUI / Samsung / Realme)
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            Xiaomi / HyperOS: Enable Autostart and set Battery Saver to No Restrictions.
          </p>
          <p className="text-slate-500 dark:text-slate-400">
            Samsung One UI: Set Battery to Unrestricted and exclude from Sleeping Apps.
          </p>
        </div>
      </section>

      {/* Aavishkar Field Telemetry Log */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <BatteryCharging className="h-4 w-4 text-amber-500" />
            Aavishkar field telemetry
          </h2>
          {telemetryLogs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="text-xs font-medium text-slate-400 hover:text-slate-700 dark:hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <div className="clean-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {telemetryLogs.length === 0 ? (
            <p className="rounded-xl bg-[#f5f7fa] p-3 text-center text-xs text-slate-500 dark:bg-[#0a0d12]">
              Start a trip to record Adaptive Polling Zones, Signal Drops, and Recalibrations.
            </p>
          ) : (
            telemetryLogs.map((log) => {
              const border =
                log.type === 'signal_lost'
                  ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-400/35 dark:bg-[#0a0d12] dark:text-amber-200'
                  : log.type === 'signal_restored'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/35 dark:bg-[#0a0d12] dark:text-emerald-200'
                  : log.type === 'alert'
                  ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-400/35 dark:bg-[#0a0d12] dark:text-rose-200'
                  : 'border-slate-200 bg-[#f5f7fa] text-slate-700 dark:border-white/[0.06] dark:bg-[#0a0d12] dark:text-slate-300';
              return (
                <div key={log.id} className={`rounded-xl border px-3 py-2 text-xs ${border}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{log.message}</span>
                    <span className="font-mono-num shrink-0 text-[10px] opacity-60">
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
      </section>

      {/* Trip History */}
      <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <History className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Trip history ({journeys.length})
        </h2>

        {journeys.length === 0 ? (
          <p className="rounded-xl bg-[#f5f7fa] p-3 text-center text-xs text-slate-500 dark:bg-[#0a0d12]">
            No completed trips yet.
          </p>
        ) : (
          <div className="space-y-2">
            {journeys.slice(0, 6).map((j) => (
              <div
                key={j.journey_id}
                className="rounded-xl border border-slate-200 bg-[#f5f7fa] p-3 dark:border-white/[0.06] dark:bg-[#0a0d12]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {j.start_location_name} to {j.destination_name}
                  </p>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-[#1c2331] dark:text-blue-300">
                    {j.alert_status}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Radius: {j.configured_alert_distance} km</span>
                  <span>Drops: {j.signal_drops_count}</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    Battery saved: {j.estimated_battery_saved_pct}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Optional Supabase Sync */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <button
          type="button"
          onClick={() => setShowSupabase((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Database: Offline-First Local Storage
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {preferences.supabaseUrl ? 'Supabase Sync Enabled' : 'Tap to optionally link Supabase'}
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
          <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-white/[0.07]">
            <input
              type="text"
              value={preferences.supabaseUrl || ''}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, supabaseUrl: e.target.value })
              }
              placeholder="Supabase Project URL (https://xxx.supabase.co)"
              className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-xs dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
            />
            <input
              type="password"
              value={preferences.supabaseAnonKey || ''}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, supabaseAnonKey: e.target.value })
              }
              placeholder="Supabase Anon Key (optional)"
              className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3 py-2 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-xs dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
            />
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              Works 100% offline even without Supabase credentials.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
