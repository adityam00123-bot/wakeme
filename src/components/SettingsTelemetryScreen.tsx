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
    setPermMessage(`Notifications: ${notif} • ${geoNote}`);
  };

  return (
    <div className="space-y-5 pb-28">
      <header className="pt-1">
        <h1 className="text-lg font-extrabold text-white">Alerts, Battery &amp; Research Telemetry</h1>
        <p className="text-xs text-slate-400">
          PRD FR-09 / FR-10 • Offline Logs, Sound/Voice Controls &amp; OEM Battery Survival
        </p>
      </header>

      {/* Alert Engine Settings (FR-10) */}
      <section className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
            <Volume2 className="h-4 w-4" />
            Smart Alert Preferences
          </h2>
          <button
            type="button"
            onClick={onTestFullAlarm}
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300 transition hover:bg-rose-500/30 active:scale-95"
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
            className={`rounded-xl border p-3 text-left transition ${
              preferences.soundEnabled
                ? 'border-cyan-500/40 bg-cyan-500/15 text-white'
                : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            <p className="text-xs font-bold">Alarm Siren</p>
            <p className="text-[11px] opacity-80">{preferences.soundEnabled ? 'Enabled' : 'Muted'}</p>
          </button>

          <button
            type="button"
            onClick={() =>
              onUpdatePreferences({
                ...preferences,
                vibrationEnabled: !preferences.vibrationEnabled,
              })
            }
            className={`rounded-xl border p-3 text-left transition ${
              preferences.vibrationEnabled
                ? 'border-cyan-500/40 bg-cyan-500/15 text-white'
                : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            <p className="text-xs font-bold">Vibration Pulse</p>
            <p className="text-[11px] opacity-80">
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
            className={`rounded-xl border p-3 text-left transition ${
              preferences.voiceAlertEnabled
                ? 'border-cyan-500/40 bg-cyan-500/15 text-white'
                : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            <p className="text-xs font-bold">Voice TTS Alert</p>
            <p className="text-[11px] opacity-80">
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
            className={`rounded-xl border p-3 text-left transition ${
              preferences.repeatAlertEnabled
                ? 'border-cyan-500/40 bg-cyan-500/15 text-white'
                : 'border-slate-800 bg-slate-950 text-slate-400'
            }`}
          >
            <p className="text-xs font-bold">Repeat Alert</p>
            <p className="text-[11px] opacity-80">
              {preferences.repeatAlertEnabled ? `Every ${preferences.repeatIntervalSec}s` : 'Once'}
            </p>
          </button>
        </div>

        {/* Voice Language (PRD Section 12 Future Scope bonus!) */}
        <div className="pt-1">
          <label className="mb-1.5 block text-xs font-semibold text-slate-300">
            Voice Alert Language (English / Hindi / Marathi)
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
                className={`rounded-xl border py-2 text-xs font-semibold transition ${
                  preferences.voiceLanguage === lang.id
                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-800 bg-slate-950 text-slate-400'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Permissions & OEM Battery Survival Guide (PRD 5E) */}
      <section className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Permissions &amp; Battery Guide
          </h2>
          <button
            type="button"
            onClick={handleRequestPermissions}
            className="rounded-xl bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300"
          >
            Check / Grant
          </button>
        </div>

        {permMessage && <p className="text-[11px] text-emerald-300">{permMessage}</p>}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
            <span className="text-slate-400">GPS API</span>
            <span className={geoSupported ? 'font-bold text-emerald-400' : 'text-rose-400'}>
              {geoSupported ? 'Ready' : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
            <span className="text-slate-400">Notifications</span>
            <span className={notifStatus === 'granted' ? 'font-bold text-emerald-400' : 'text-amber-400'}>
              {notifStatus}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
            <span className="text-slate-400">Screen WakeLock</span>
            <span className={wakeLockSupported ? 'font-bold text-emerald-400' : 'text-slate-400'}>
              {wakeLockSupported ? 'Supported' : 'Fallback'}
            </span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-slate-950 px-3 py-2">
            <span className="text-slate-400">Vibration</span>
            <span className={vibrationSupported ? 'font-bold text-emerald-400' : 'text-slate-400'}>
              {vibrationSupported ? 'Ready' : 'Desktop'}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-300">
          <p className="flex items-center gap-1.5 font-bold text-white">
            <Smartphone className="h-3.5 w-3.5 text-amber-400" />
            Android OEM Survival Checklist (MIUI / Samsung / Realme)
          </p>
          <p className="text-slate-400">
            • <strong>Xiaomi / HyperOS:</strong> Enable Autostart + Battery Saver → No Restrictions.
          </p>
          <p className="text-slate-400">
            • <strong>Samsung One UI:</strong> Set Battery to Unrestricted &amp; remove from Sleeping Apps.
          </p>
          <p className="text-slate-400">
            • <strong>Android 14+ Production:</strong> Uses Foreground Service (`location`) + Alarm stream.
          </p>
        </div>
      </section>

      {/* Aavishkar Live Event Telemetry Log */}
      <section className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
            <BatteryCharging className="h-4 w-4" />
            Aavishkar Field Telemetry Log
          </h2>
          {telemetryLogs.length > 0 && (
            <button
              type="button"
              onClick={onClearLogs}
              className="text-[11px] font-medium text-slate-400 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>

        <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {telemetryLogs.length === 0 ? (
            <p className="rounded-xl bg-slate-950 p-3 text-center text-xs text-slate-500">
              Start a journey to record Adaptive Polling Zones, Signal Drops &amp; Recalibration events.
            </p>
          ) : (
            telemetryLogs.map((log) => {
              const badge =
                log.type === 'signal_lost'
                  ? 'border-amber-500/40 text-amber-300'
                  : log.type === 'signal_restored'
                  ? 'border-emerald-500/40 text-emerald-300'
                  : log.type === 'alert'
                  ? 'border-rose-500/40 text-rose-300'
                  : 'border-slate-800 text-slate-300';
              return (
                <div
                  key={log.id}
                  className={`rounded-xl border bg-slate-950 px-3 py-2 text-[11px] ${badge}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{log.message}</span>
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

      {/* Journey History (FR-09) */}
      <section className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
          <History className="h-4 w-4 text-cyan-400" />
          Stored Journey History ({journeys.length})
        </h2>

        {journeys.length === 0 ? (
          <p className="rounded-xl bg-slate-950 p-3 text-center text-xs text-slate-500">
            No completed journeys yet.
          </p>
        ) : (
          <div className="space-y-2">
            {journeys.slice(0, 6).map((j) => (
              <div key={j.journey_id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-white">
                    {j.start_location_name} → {j.destination_name}
                  </p>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                    {j.alert_status}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[10px] text-slate-400">
                  <span>Radius: {j.configured_alert_distance} km</span>
                  <span>Drops: {j.signal_drops_count}</span>
                  <span className="text-emerald-400">Battery Saved: {j.estimated_battery_saved_pct}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Optional Supabase Cloud Sync */}
      <section className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        <button
          type="button"
          onClick={() => setShowSupabase((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div className="flex items-center gap-2.5">
            <Database className="h-4 w-4 text-emerald-400" />
            <div>
              <p className="text-xs font-bold text-white">Database: Offline-First Local DB Active</p>
              <p className="text-[11px] text-slate-400">
                {preferences.supabaseUrl ? 'Supabase Sync Enabled' : 'Tap to optionally link Supabase'}
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
          <div className="mt-3 space-y-2.5 border-t border-slate-800 pt-3">
            <input
              type="text"
              value={preferences.supabaseUrl || ''}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, supabaseUrl: e.target.value })
              }
              placeholder="Supabase Project URL (https://xxx.supabase.co)"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
            />
            <input
              type="password"
              value={preferences.supabaseAnonKey || ''}
              onChange={(e) =>
                onUpdatePreferences({ ...preferences, supabaseAnonKey: e.target.value })
              }
              placeholder="Supabase Anon Key (optional)"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
            />
            <p className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              Even without Supabase keys, WakeMe works 100% offline via persistent local storage.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
