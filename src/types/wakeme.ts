export type AlertLanguage = 'en' | 'hi' | 'mr';

export type DestinationCategory = 'Home' | 'College' | 'Office' | 'Station' | 'Custom';

export type MumbaiLine = 'Western' | 'Central' | 'Harbour' | 'Metro / Bus' | 'Custom';

export type PollingZone = 'ZONE_1_ECO' | 'ZONE_2_BALANCED' | 'ZONE_3_HIGH';

export type ConnectionHealth = 'ONLINE_GPS' | 'OFFLINE_GPS_ONLY' | 'DEAD_RECKONING' | 'RECALIBRATED';

export type JourneyStatus = 'idle' | 'active' | 'paused' | 'alerting' | 'completed' | 'cancelled';

export type AlertStatus =
  | 'none'
  | 'gps_proximity'
  | 'dead_reckoning_eta'
  | 'snoozed'
  | 'dismissed';

export interface UserPreferences {
  defaultAlertRadiusKm: number;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  voiceAlertEnabled: boolean;
  voiceLanguage: AlertLanguage;
  repeatAlertEnabled: boolean;
  repeatIntervalSec: number;
  alarmVolume: number; // 0.2 to 1.0
  stopBufferMinutesPerStop: number;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface UserProfile {
  user_id: string;
  name: string;
  contact: string; // email or mobile
  isGuest: boolean;
  preferences: UserPreferences;
}

export interface Destination {
  destination_id: string;
  user_id: string;
  destination_name: string;
  subtitle?: string;
  category: DestinationCategory;
  line: MumbaiLine;
  latitude: number;
  longitude: number;
  favourite_status: boolean;
  created_at: string;
  last_used_at?: string;
}

export interface TelemetryLogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'zone_change' | 'signal_lost' | 'signal_restored' | 'alert';
  message: string;
}

export interface JourneyRecord {
  journey_id: string;
  user_id: string;
  start_location_name: string;
  start_lat: number;
  start_lng: number;
  selected_destination_id: string;
  destination_name: string;
  destination_lat: number;
  destination_lng: number;
  start_time: string;
  end_time?: string;
  journey_status: JourneyStatus;
  alert_status: AlertStatus;
  configured_alert_distance: number; // km
  expected_stops_remaining: number;
  mode: 'live_gps' | 'simulator';
  route_id?: string;
  max_speed_kmh: number;
  signal_drops_count: number;
  estimated_battery_saved_pct: number;
  min_distance_reached_km: number;
}

export interface MumbaiStation {
  id: string;
  name: string;
  code: string;
  line: 'Western' | 'Central' | 'Harbour';
  lat: number;
  lng: number;
  isMajor: boolean;
}

export interface MumbaiPresetRoute {
  id: string;
  title: string;
  line: 'Western' | 'Central' | 'Harbour';
  trainType: 'Fast' | 'Slow';
  avgSpeedKmh: number;
  stationIds: string[];
  defaultAlertKm: number;
}

export interface LiveTrackingState {
  currentLat: number;
  currentLng: number;
  distanceKm: number;
  speedKmh: number;
  accuracyMeters: number;
  etaMinutes: number | null;
  pollingZone: PollingZone;
  pollIntervalSec: number;
  connectionHealth: ConnectionHealth;
  // Dead-reckoning snapshot when signal drops
  deadReckoningActive: boolean;
  drSnapshotDistanceKm: number | null;
  drSnapshotSpeedKmh: number | null;
  drStopsBufferCount: number;
  drRemainingSec: number | null;
  drTotalEstimatedSec: number | null;
  recalibrationNotice: string | null;
  consecutiveHitsInRadius: number;
  gpsChecksPerformed: number;
  staticBaselineChecks: number;
  simProgress: number; // 0..1 when in simulator mode
  simSpeedMultiplier: number; // 1, 5, 15, 30
  nextStationName: string | null;
  remainingStopsCount: number;
}
