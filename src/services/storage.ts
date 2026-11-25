import { DEFAULT_DESTINATIONS } from '../data/mumbaiLocal';
import {
  Destination,
  JourneyRecord,
  TelemetryLogEntry,
  UserPreferences,
  UserProfile,
} from '../types/wakeme';

const KEYS = {
  USER: 'wakeme_user_v2',
  DESTINATIONS: 'wakeme_destinations_v2',
  JOURNEYS: 'wakeme_journeys_v2',
  LOGS: 'wakeme_telemetry_logs_v2',
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'light',
  defaultAlertRadiusKm: 5.0,
  soundEnabled: true,
  vibrationEnabled: true,
  voiceAlertEnabled: true,
  voiceLanguage: 'en',
  repeatAlertEnabled: true,
  repeatIntervalSec: 20,
  alarmVolume: 1.0,
  stopBufferMinutesPerStop: 2.0,
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export const DEFAULT_USER: UserProfile = {
  user_id: 'guest-commuter',
  name: 'Aavishkar Commuter',
  contact: 'Long-Distance & Local',
  isGuest: true,
  preferences: DEFAULT_PREFERENCES,
};

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota errors cleanly
  }
}

export function loadUserProfile(): UserProfile {
  const user = safeRead<UserProfile>(KEYS.USER, DEFAULT_USER);
  return {
    ...DEFAULT_USER,
    ...user,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...(user?.preferences || {}),
    },
  };
}

export function saveUserProfile(user: UserProfile): void {
  safeWrite(KEYS.USER, user);
}

export function loadDestinations(): Destination[] {
  const list = safeRead<Destination[] | null>(KEYS.DESTINATIONS, null);
  if (!list || list.length === 0) {
    safeWrite(KEYS.DESTINATIONS, DEFAULT_DESTINATIONS);
    return DEFAULT_DESTINATIONS;
  }
  return list;
}

export function saveDestinations(destinations: Destination[]): void {
  safeWrite(KEYS.DESTINATIONS, destinations);
}

export function loadJourneys(): JourneyRecord[] {
  return safeRead<JourneyRecord[]>(KEYS.JOURNEYS, []);
}

export function saveJourneys(journeys: JourneyRecord[]): void {
  safeWrite(KEYS.JOURNEYS, journeys.slice(0, 50));
}

export function loadTelemetryLogs(): TelemetryLogEntry[] {
  return safeRead<TelemetryLogEntry[]>(KEYS.LOGS, []);
}

export function saveTelemetryLogs(logs: TelemetryLogEntry[]): void {
  safeWrite(KEYS.LOGS, logs.slice(0, 80));
}

export async function syncRecordToSupabase(
  table: 'destinations' | 'journeys',
  payload: Record<string, unknown>,
  prefs: UserPreferences
): Promise<{ ok: boolean; reason?: string }> {
  const url = prefs.supabaseUrl?.trim().replace(/\/$/, '');
  const key = prefs.supabaseAnonKey?.trim();
  if (!url || !key) {
    return { ok: false, reason: 'local_only' };
  }

  try {
    const res = await fetch(`${url}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}
