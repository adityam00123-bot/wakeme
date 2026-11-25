import React, { useState } from 'react';
import {
  BatteryCharging,
  BellRing,
  CheckCircle2,
  Cloud,
  Database,
  History,
  ShieldCheck,
  Smartphone,
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
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-[-0.025em] text-white">
          Alerts &amp; Telemetry
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Voice alerts, device permissions, battery survival guide, and field logs.
        </p>
      </header>

      {/* Alert Engine Settings */}
      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Volume2 className="h-4 w-4 text-cyan-300" />
            Smart alert preferences
          </h2>
          <button
            type="button"
            onClick={onTestFullAlarm}
            className="pressable inline-flex items-center gap-1.5 rounded-xl border border-rose-400/35 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
          >
            <BellRing className="h-3.5 w-3.5" />
            Test Full Alarm
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
                ? 'border-cyan-400/40 bg-cyan-400/12 text-white'
                : 'border-white/[0.07] bg-[#05070b] text-slate-400'
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
                ? 'border-cyan-400/40 bg-cyan-400/12 text-white'
                : 'border-white/[0.07] bg-[#05070b] text-slate-400'
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
                ? 'border-cyan-400/40 bg-cyan-400/12 text-white'
                : 'border-white/[0.07] bg-[#05070b] text-slate-400'
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
                ? 'border-cyan-400/40 bg-cyan-400/12 text-white'
                : 'border-white/[0.07] bg-[#05070b] text-slate-400'
            }`}
          >
            <p className="text-xs font-semibold">Repeat Alert</p>
            <p className="mt-0.5 text-[11px] opacity-80">
              {preferences.repeatAlertEnabled ? `Every ${preferences.repeatIntervalSec}s` : 'Once'}
            </p>
          </button>
        </div>

        <div className="pt-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-300">
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
                    ? 'border-cyan-400 bg-cyan-400/20 text-cyan-200'
                    : 'border-white/[0.08] bg-[#05070b] text-slate-400'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Permissions & OEM Battery Survival Guide */}
      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            Permissions &amp; battery survival
          </h2>
          <button
            type="button"
            onClick={handleRequestPermissions}
            className="pressable rounded-xl bg-emerald-400/20 px-3 py-1.5 text-xs font-semibold text-emerald-300"
          >
            Check / Grant
          </button>
        </div>

        {permMessage && <p className="text-xs text-emerald-300">{permMessage}</p>}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center justify-between rounded-xl bg-[#05070b] px-3 py-2">
            <span className="text-slate-400">GPS API</span>
            <span className={geoSupported ? 'font-semibold text-emerald-400' : 'text-rose-400'}>
              {geoSupported ? 'Ready' : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#05070b] px-3 py-2">
            <span className="text-slate-400">Notifications</span>
            <span className={notifStatus === 'granted' ? 'font-semibold text-emerald-400' : 'text-amber-400'}>
              {notifStatus}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#05070b] px-3 py-2">
            <span className="text-slate-400">WakeLock</span>
            <span className={wakeLockSupported ? 'font-semibold text-emerald-400' : 'text-slate-400'}>
              {wakeLockSupported ? 'Supported' : 'Fallback'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-[#05070b] px-3 py-2">
            <span className="text-slate-400">Vibration</span>
            <span className={vibrationSupported ? 'font-semibold text-emerald-400' : 'text-slate-400'}>
              {vibrationSupported ? 'Ready' : 'Desktop'}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-[#05070b] p-3 text-xs text-slate-300">
          <p className="flex items-center gap-1.5 font-semibold text-white">
            <Smartphone className="h-3.5 w-3.5 text-amber-400" />
            Android OEM checklist (MIUI / Samsung / Realme)
          </p>
          <p className="text-slate-400">
            Xiaomi / HyperOS: Enable Autostart and set Battery Saver to No Restrictions.
          </p>
          <p className="text-slate-400">
            Samsung One UI: Set Battery to Unrestricted and exclude from Sleeping Apps.
          </p>
          <p className="text-slate-400">
            Android 14+ target: Uses Foreground Location Service and Alarm audio stream.
          </p>
        </div>
      </section>

      {/* Aavishkar Live Event Telemetry Log */}
      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <BatteryCharging className="h-4 w-4 text-amber-400" />
            Field telemetry log
          </h2>
          {telemetryLogs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="text-xs font-medium text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <div className="clean-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {telemetryLogs.length === 0 ? (
            <p className="rounded-xl bg-[#05070b] p-3 text-center text-xs text-slate-500">
              Start a journey to record Adaptive Polling Zones, Signal Drops, and Recalibrations.
            </p>
          ) : (
            telemetryLogs.map((log) => {
              const border =
                log.type === 'signal_lost'
                  ? 'border-amber-400/35 text-amber-200'
                  : log.type === 'signal_restored'
                  ? 'border-emerald-400/35 text-emerald-200'
                  : log.type === 'alert'
                  ? 'border-rose-400/35 text-rose-200'
                  : 'border-white/[0.06] text-slate-300';
              return (
                <div
                  key={log.id}
                  className={`rounded-xl border bg-[#05070b] px-3 py-2 text-xs ${border}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{log.message}</span>
                    <span className="font-mono-num shrink-0 text-[10px] text-slate-500">
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

      {/* Journey History */}
      <section className="space-y-3 rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
          <History className="h-4 w-4 text-cyan-400" />
          Stored journey history ({journeys.length})
        </h2>

        {journeys.length === 0 ? (
          <p className="rounded-xl bg-[#05070b] p-3 text-center text-xs text-slate-500">
            No completed journeys yet.
          </p>
        ) : (
          <div className="space-y-2">
            {journeys.slice(0, 6).map((j) => (
              <div key={j.journey_id} className="rounded-xl border border-white/[0.06] bg-[#05070b] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-white">
                    {j.start_location_name} to {j.destination_name}
                  </p>
                  <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                    {j.alert_status}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-slate-400">
                  <span>Radius: {j.configured_alert_distance} km</span>
                  <span>Drops: {j.signal_drops_count}</span>
                  <span className="text-emerald-400">Battery saved: {j.estimated_battery_saved_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Optional Supabase Cloud Sync */}
      <section className="rounded-2xl border border-white/[0.08] bg-[#0e1524] p-4">
        <button
          type="button"
          onClick={() => setShowSupabase((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-white">Database: Offline-First Local DB Active</p>
              <p className="text-[11px] text-slate-400">
                {preferences.supabaseUrl ? 'Supabase Sync Enabled' : 'Tap to optionally connect Supabase'}
              </p>
            </div>
          </div>
          {preferences.supabaseUrl ? (
            <Cloud className="h-4 w-4 text-cyan-400" />
          ) : (
            <Wifi className="h-4 w-4 text-slate-500" />
          )}
        </button>

        {showSupabase && (
          <div className="mt-3 space-y-2.5 border-t border-white/[0.07] pt-3">
            <input
              type="text"
              value={preferences.supabaseUrl || ''}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, supabaseUrl: e.target.value })
              }
              placeholder="Supabase Project URL (https://xxx.supabase.co)"
              className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-base text-white outline-none focus:border-cyan-400/60 sm:text-xs"
            />
            <input
              type="password"
              value={preferences.supabaseAnonKey || ''}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, supabaseAnonKey: e.target.value })
              }
              placeholder="Supabase Anon Key (optional)"
              className="w-full rounded-xl border border-white/10 bg-[#05070b] px-3 py-2 text-base text-white outline-none focus:border-cyan-400/60 sm:text-xs"
            />
            <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Even without Supabase keys, WakeMe works 100% offline via persistent local storage.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
