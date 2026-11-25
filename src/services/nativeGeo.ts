import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

export interface UnifiedGeoFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  heading: number | null;
}

export function isGeoAvailable(): boolean {
  return Capacitor.isNativePlatform() || (typeof navigator !== 'undefined' && 'geolocation' in navigator);
}

export async function getCurrentPositionUnified(timeoutMs = 8000): Promise<UnifiedGeoFix> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perms = await Geolocation.checkPermissions();
      if (perms.location !== 'granted' && perms.coarseLocation !== 'granted') {
        const requested = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
        if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
          throw Object.assign(new Error('Location permission denied'), { code: 1 });
        }
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 3000,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 15,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
      };
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || String(err);
      const isDisabled = /disabled|location services|gps/i.test(msg) && !/denied|permission/i.test(msg);
      throw Object.assign(new Error(msg), { code: isDisabled ? 2 : 1 });
    }
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    throw Object.assign(new Error('Geolocation API unavailable'), { code: 2 });
  }

  return new Promise<UnifiedGeoFix>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 15,
          speed: pos.coords.speed ?? null,
          heading: pos.coords.heading ?? null,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 3000 }
    );
  });
}

export async function watchPositionUnified(
  onFix: (fix: UnifiedGeoFix) => void,
  onError: (err: { code?: number; message?: string }) => void
): Promise<() => void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const perms = await Geolocation.checkPermissions();
      if (perms.location !== 'granted' && perms.coarseLocation !== 'granted') {
        const requested = await Geolocation.requestPermissions({
          permissions: ['location', 'coarseLocation'],
        });
        if (requested.location !== 'granted' && requested.coarseLocation !== 'granted') {
          onError({ code: 1, message: 'Location permission denied' });
          return () => {};
        }
      }
    } catch (err) {
      const msg = String(err);
      const isDenied = /denied|permission/i.test(msg);
      onError({ code: isDenied ? 1 : 2, message: msg });
      return () => {};
    }

    const watchId = await Geolocation.watchPosition(
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 },
      (pos, err) => {
        if (err) {
          const msg = err.message || '';
          const isDenied = /denied|permission/i.test(msg);
          onError({ code: isDenied ? 1 : 2, message: msg });
          return;
        }
        if (pos) {
          onFix({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 15,
            speed: pos.coords.speed ?? null,
            heading: pos.coords.heading ?? null,
          });
        }
      }
    );

    return () => {
      void Geolocation.clearWatch({ id: watchId });
    };
  }

  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    onError({ code: 2, message: 'Geolocation API unavailable' });
    return () => {};
  }

  const webWatchId = navigator.geolocation.watchPosition(
    (pos) => {
      onFix({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 15,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
      });
    },
    (err) => onError({ code: err.code, message: err.message }),
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
  );

  return () => {
    navigator.geolocation.clearWatch(webWatchId);
  };
}
