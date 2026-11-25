import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BatteryCharging,
  BellRing,
  CheckCircle2,
  Loader2,
  MapPin,
  Settings,
  ShieldCheck,
  Volume2,
} from 'lucide-react';
import { alertEngine } from '../services/alertEngine';
import {
  StartupPermissionReadiness,
  checkStartupPermissionReadiness,
  openAndroidAppSettings,
  openAndroidLocationToggleSettings,
  requestBatteryOptimizationExemption,
  requestNativeLocationPermission,
  requestNativeNotificationPermission,
} from '../services/nativePermissions';

interface StartupPermissionsModalProps {
  isOpen: boolean;
  readiness: StartupPermissionReadiness;
  onUpdateReadiness: (next: StartupPermissionReadiness) => void;
  onComplete: () => void;
}

export const StartupPermissionsModal: React.FC<StartupPermissionsModalProps> = ({
  isOpen,
  readiness,
  onUpdateReadiness,
  onComplete,
}) => {
  const [activeStep, setActiveStep] = useState<'idle' | 'location' | 'notifications' | 'battery' | 'done'>('idle');
  const [busy, setBusy] = useState(false);
  const autoRanRef = useRef(false);

  const runPermissionSequence = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    alertEngine.unlockAudio();

    try {
      let current = await checkStartupPermissionReadiness();
      onUpdateReadiness(current);

      if (current.location !== 'granted') {
        setActiveStep('location');
        await requestNativeLocationPermission();
        current = await checkStartupPermissionReadiness();
        onUpdateReadiness(current);
      }

      if (current.notifications !== 'granted' && current.notifications !== 'unsupported') {
        setActiveStep('notifications');
        await requestNativeNotificationPermission();
        current = await checkStartupPermissionReadiness();
        onUpdateReadiness(current);
      }

      if (current.isNative && !current.batteryUnrestricted) {
        setActiveStep('battery');
        await requestBatteryOptimizationExemption();
        current = await checkStartupPermissionReadiness();
        onUpdateReadiness(current);
      }

      if (current.allCriticalReady) {
        setActiveStep('done');
        window.setTimeout(() => {
          onComplete();
        }, 650);
      } else {
        setActiveStep('idle');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, onComplete, onUpdateReadiness]);

  useEffect(() => {
    if (!isOpen) {
      autoRanRef.current = false;
      return;
    }
    if (autoRanRef.current) return;
    autoRanRef.current = true;
    void runPermissionSequence();
  }, [isOpen, runPermissionSequence]);

  if (!isOpen) return null;

  const hasDeniedPrompt =
    readiness.location === 'denied' || readiness.notifications === 'denied';

  const statusBadge = (granted: boolean, requesting: boolean, denied = false, actionLabel = 'Enable') => {
    if (granted) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Granted
        </span>
      );
    }
    if (requesting) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Asking…
        </span>
      );
    }
    return (
      <span
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
          denied
            ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
        }`}
      >
        {denied ? 'Blocked' : actionLabel}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/65 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-[#141923]">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
              Allow Permissions for Live Alarm
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Ek baar allow kar dein taaki GPS tracking, loud notification aur background alarm bina settings khole kaam karein.
            </p>
          </div>
        </div>

        {/* Checklist Rows */}
        <div className="space-y-2">
          {/* 1. Location */}
          <button
            type="button"
            disabled={busy || readiness.location === 'granted'}
            onClick={async () => {
              alertEngine.unlockAudio();
              if (readiness.location === 'denied') {
                onUpdateReadiness(await openAndroidAppSettings());
              } else {
                await requestNativeLocationPermission();
                onUpdateReadiness(await checkStartupPermissionReadiness());
              }
            }}
            className="pressable flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[#f5f7fa] px-3.5 py-3 text-left dark:border-white/[0.08] dark:bg-[#0a0d12]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <MapPin className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  Precise Location (GPS)
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Detects distance &amp; upcoming stations
                </p>
              </div>
            </div>
            {statusBadge(
              readiness.location === 'granted',
              activeStep === 'location',
              readiness.location === 'denied',
              'Tap to Allow'
            )}
          </button>

          {/* 2. Notifications */}
          <button
            type="button"
            disabled={busy || readiness.notifications === 'granted'}
            onClick={async () => {
              alertEngine.unlockAudio();
              if (readiness.notifications === 'denied') {
                onUpdateReadiness(await openAndroidAppSettings());
              } else {
                await requestNativeNotificationPermission();
                onUpdateReadiness(await checkStartupPermissionReadiness());
              }
            }}
            className="pressable flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[#f5f7fa] px-3.5 py-3 text-left dark:border-white/[0.08] dark:bg-[#0a0d12]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <BellRing className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white">
                  High-Priority Alarm Alerts
                </p>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  Rings &amp; wakes screen near station
                </p>
              </div>
            </div>
            {statusBadge(
              readiness.notifications === 'granted' || readiness.notifications === 'unsupported',
              activeStep === 'notifications',
              readiness.notifications === 'denied',
              'Tap to Allow'
            )}
          </button>

          {/* 3. Battery Optimization Exemption (Native Android) */}
          {readiness.isNative && (
            <button
              type="button"
              disabled={busy || readiness.batteryUnrestricted}
              onClick={async () => {
                alertEngine.unlockAudio();
                setBusy(true);
                setActiveStep('battery');
                await requestBatteryOptimizationExemption();
                const updated = await checkStartupPermissionReadiness();
                onUpdateReadiness(updated);
                setActiveStep('idle');
                setBusy(false);
                if (updated.allCriticalReady) onComplete();
              }}
              className="pressable flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-[#f5f7fa] px-3.5 py-3 text-left dark:border-white/[0.08] dark:bg-[#0a0d12]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <BatteryCharging className="h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white">
                    Unrestricted Background Battery
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    Prevents phone from pausing GPS &amp; alarm
                  </p>
                </div>
              </div>
              {statusBadge(
                readiness.batteryUnrestricted,
                activeStep === 'battery',
                false,
                'Allow'
              )}
            </button>
          )}

          {/* Device Master GPS Switch Warning if turned OFF */}
          {readiness.isNative && !readiness.gpsHardwareEnabled && (
            <button
              type="button"
              onClick={async () => {
                onUpdateReadiness(await openAndroidLocationToggleSettings());
              }}
              className="pressable flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-left dark:border-rose-500/35 dark:bg-rose-500/15"
            >
              <span className="text-xs font-bold text-rose-700 dark:text-rose-200">
                Phone GPS Toggle is OFF — Tap to Turn On
              </span>
              <span className="rounded-lg bg-rose-600 px-2.5 py-1 text-[11px] font-bold text-white">
                Turn On
              </span>
            </button>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {readiness.allCriticalReady ? (
            <button
              type="button"
              onClick={() => {
                alertEngine.unlockAudio();
                onComplete();
              }}
              className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white shadow-md"
            >
              <CheckCircle2 className="h-4 w-4" />
              All Ready — Continue to WakeMe
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (hasDeniedPrompt) {
                  void openAndroidAppSettings().then((next) => {
                    onUpdateReadiness(next);
                    if (next.allCriticalReady) onComplete();
                  });
                } else {
                  void runPermissionSequence();
                }
              }}
              className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md hover:bg-blue-700 disabled:opacity-70 dark:bg-blue-500"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Requesting Permissions…
                </>
              ) : hasDeniedPrompt ? (
                <>
                  <Settings className="h-4 w-4" />
                  Open App Settings to Allow
                </>
              ) : (
                <>
                  <Volume2 className="h-4 w-4" />
                  Allow All &amp; Unlock Alarm
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              alertEngine.unlockAudio();
              onComplete();
            }}
            className="w-full py-1.5 text-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Continue to app
          </button>
        </div>
      </div>
    </div>
  );
};
