import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { alertEngine } from './alertEngine';

interface WakeMeSystemPlugin {
  getSystemStatus(): Promise<{
    isIgnoringBatteryOptimizations: boolean;
    gpsProviderEnabled: boolean;
    canScheduleExactAlarms: boolean;
  }>;
  requestIgnoreBatteryOptimizations(): Promise<{
    isIgnoringBatteryOptimizations: boolean;
    gpsProviderEnabled: boolean;
    canScheduleExactAlarms: boolean;
  }>;
  openAppSettings(): Promise<{
    isIgnoringBatteryOptimizations: boolean;
    gpsProviderEnabled: boolean;
    canScheduleExactAlarms: boolean;
  }>;
  openLocationSettings(): Promise<{
    isIgnoringBatteryOptimizations: boolean;
    gpsProviderEnabled: boolean;
    canScheduleExactAlarms: boolean;
  }>;
  setAlarmScreenMode(options: { enabled: boolean }): Promise<void>;
}

const WakeMeSystem = registerPlugin<WakeMeSystemPlugin>('WakeMeSystem');

export type PermState = 'granted' | 'denied' | 'prompt';

export interface StartupPermissionReadiness {
  isNative: boolean;
  location: PermState;
  notifications: PermState | 'unsupported';
  batteryUnrestricted: boolean;
  gpsHardwareEnabled: boolean;
  allCriticalReady: boolean;
}

function mapNativeLocState(perms: { location: string; coarseLocation: string }): PermState {
  if (perms.location === 'granted' || perms.coarseLocation === 'granted') return 'granted';
  if (perms.location === 'denied' && perms.coarseLocation === 'denied') return 'denied';
  return 'prompt';
}

export async function checkStartupPermissionReadiness(): Promise<StartupPermissionReadiness> {
  const isNative = Capacitor.isNativePlatform();

  if (!isNative) {
    const notifPerm =
      typeof window !== 'undefined' && 'Notification' in window
        ? Notification.permission === 'default'
          ? 'prompt'
          : Notification.permission
        : 'unsupported';

    let locPerm: PermState = 'prompt';
    try {
      if (navigator.permissions?.query) {
        const res = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
        locPerm = res.state === 'granted' ? 'granted' : res.state === 'denied' ? 'denied' : 'prompt';
      }
    } catch {
      // Browsers without permissions query keep 'prompt'
    }

    return {
      isNative: false,
      location: locPerm,
      notifications: notifPerm,
      batteryUnrestricted: true,
      gpsHardwareEnabled: true,
      allCriticalReady: locPerm === 'granted' && (notifPerm === 'granted' || notifPerm === 'unsupported'),
    };
  }

  let location: PermState = 'prompt';
  try {
    const perms = await Geolocation.checkPermissions();
    location = mapNativeLocState(perms);
  } catch (err: unknown) {
    const msg = String((err as { message?: string })?.message || err);
    if (/denied|permission/i.test(msg)) {
      location = 'denied';
    }
  }

  let notifications: PermState = 'prompt';
  try {
    const n = await LocalNotifications.checkPermissions();
    notifications = n.display === 'granted' ? 'granted' : n.display === 'denied' ? 'denied' : 'prompt';
  } catch {
    notifications = 'prompt';
  }

  let batteryUnrestricted = false;
  let gpsHardwareEnabled = true;
  try {
    const sys = await WakeMeSystem.getSystemStatus();
    batteryUnrestricted = Boolean(sys.isIgnoringBatteryOptimizations);
    gpsHardwareEnabled = Boolean(sys.gpsProviderEnabled);
  } catch {
    batteryUnrestricted = true;
  }

  return {
    isNative: true,
    location,
    notifications,
    batteryUnrestricted,
    gpsHardwareEnabled,
    allCriticalReady:
      location === 'granted' &&
      notifications === 'granted' &&
      batteryUnrestricted &&
      gpsHardwareEnabled,
  };
}

export async function requestNativeLocationPermission(): Promise<PermState> {
  if (!Capacitor.isNativePlatform()) {
    if (!('geolocation' in navigator)) return 'denied';
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve('granted'),
        (err) => resolve(err.code === 1 ? 'denied' : 'prompt'),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    });
  }
  try {
    const cur = await Geolocation.checkPermissions();
    if (cur.location === 'granted' || cur.coarseLocation === 'granted') {
      return 'granted';
    }
    const req = await Geolocation.requestPermissions({
      permissions: ['location', 'coarseLocation'],
    });
    return mapNativeLocState(req);
  } catch {
    return 'denied';
  }
}

export async function requestNativeNotificationPermission(): Promise<PermState | 'unsupported'> {
  const perm = await alertEngine.requestNotificationPermission();
  return perm === 'default' ? 'prompt' : perm;
}

export async function requestBatteryOptimizationExemption(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;
  try {
    const res = await WakeMeSystem.requestIgnoreBatteryOptimizations();
    return Boolean(res.isIgnoringBatteryOptimizations);
  } catch {
    return false;
  }
}

export async function openAndroidAppSettings(): Promise<StartupPermissionReadiness> {
  if (Capacitor.isNativePlatform()) {
    try {
      await WakeMeSystem.openAppSettings();
    } catch {
      // Ignore fallback failures
    }
  }
  return checkStartupPermissionReadiness();
}

export async function openAndroidLocationToggleSettings(): Promise<StartupPermissionReadiness> {
  if (Capacitor.isNativePlatform()) {
    try {
      await WakeMeSystem.openLocationSettings();
    } catch {
      // Ignore
    }
  }
  return checkStartupPermissionReadiness();
}

export async function setNativeAlarmScreenMode(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WakeMeSystem.setAlarmScreenMode({ enabled });
  } catch {
    // Ignore on restricted devices
  }
}
