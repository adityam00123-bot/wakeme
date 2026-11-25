import { AlertLanguage, UserPreferences } from '../types/wakeme';

function encodeWavDataUrl(samples: Float32Array, sampleRate = 8000): string {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function buildSilentKeepAliveWav(): string {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * 40 * i) / sampleRate) * 0.00025;
  }
  return encodeWavDataUrl(samples, sampleRate);
}

function buildAlarmRingWav(): string {
  const sampleRate = 12000;
  const durationSec = 1.6;
  const total = Math.floor(sampleRate * durationSec);
  const samples = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate;
    const cycle = t % 0.8;
    const isBeep1 = cycle >= 0.02 && cycle < 0.24;
    const isBeep2 = cycle >= 0.28 && cycle < 0.56;
    if (isBeep1 || isBeep2) {
      const f1 = isBeep1 ? 960 : 1240;
      const f2 = isBeep1 ? 1440 : 1860;
      const raw = Math.sin(2 * Math.PI * f1 * t) * 0.65 + Math.sin(2 * Math.PI * f2 * t) * 0.35;
      samples[i] = raw * 0.88;
    } else {
      samples[i] = 0;
    }
  }
  return encodeWavDataUrl(samples, sampleRate);
}

class WakeMeAlertEngine {
  private audioCtx: AudioContext | null = null;
  private keepAliveEl: HTMLAudioElement | null = null;
  private alarmAudioEl: HTMLAudioElement | null = null;
  private pulseTimer: number | null = null;
  private repeatTimer: number | null = null;
  private wakeLockSentinel: WakeLockSentinel | null = null;
  private keepAliveActive = false;
  private active = false;
  private silentWavUrl: string | null = null;
  private alarmWavUrl: string | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.keepAliveActive) {
          void this.acquireWakeLock();
        }
      });
    }
  }

  private ensureAudioElements(): void {
    if (typeof Audio === 'undefined') return;
    if (!this.silentWavUrl) this.silentWavUrl = buildSilentKeepAliveWav();
    if (!this.alarmWavUrl) this.alarmWavUrl = buildAlarmRingWav();

    if (!this.keepAliveEl) {
      const el = new Audio(this.silentWavUrl);
      el.loop = true;
      el.volume = 0.01;
      el.setAttribute('playsinline', 'true');
      this.keepAliveEl = el;
    }
    if (!this.alarmAudioEl) {
      const el = new Audio(this.alarmWavUrl);
      el.loop = true;
      el.volume = 1.0;
      el.setAttribute('playsinline', 'true');
      this.alarmAudioEl = el;
    }
  }

  /**
   * Call during a user tap ("Start Trip" / "Test Alarm") so mobile browsers unlock Web Audio & HTML5 Audio.
   */
  public unlockAudio(): void {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        if (!this.audioCtx) {
          this.audioCtx = new AudioContextCtor();
        }
        if (this.audioCtx.state === 'suspended') {
          void this.audioCtx.resume();
        }
      }
      this.ensureAudioElements();
    } catch {
      // AudioContext unavailable
    }
  }

  /**
   * Keeps PWA timers & GPS alive on mobile screens via an inaudible looping MediaSession track.
   */
  public startKeepAlive(destinationName: string): void {
    this.keepAliveActive = true;
    this.unlockAudio();
    try {
      if (this.keepAliveEl && this.keepAliveEl.paused) {
        void this.keepAliveEl.play().catch(() => {});
      }
      if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `WakeMe Armed · ${destinationName}`,
          artist: 'Live GPS & Dead-Reckoning Guard',
          album: 'WakeMe Transit',
        });
      }
    } catch {
      // Ignore background media restriction
    }
  }

  public stopKeepAlive(): void {
    this.keepAliveActive = false;
    try {
      if (this.keepAliveEl) {
        this.keepAliveEl.pause();
        this.keepAliveEl.currentTime = 0;
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
    } catch {
      // Ignore
    }
  }

  public async acquireWakeLock(): Promise<boolean> {
    try {
      if ('wakeLock' in navigator && navigator.wakeLock) {
        this.wakeLockSentinel = await navigator.wakeLock.request('screen');
        return true;
      }
    } catch {
      // Not granted or unsupported
    }
    return false;
  }

  public async releaseWakeLock(): Promise<void> {
    this.stopKeepAlive();
    try {
      if (this.wakeLockSentinel) {
        await this.wakeLockSentinel.release();
        this.wakeLockSentinel = null;
      }
    } catch {
      // Ignore
    }
  }

  public async requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }

  private playDualToneChime(volume = 1.0): void {
    this.unlockAudio();
    if (!this.audioCtx) return;

    const ctx = this.audioCtx;
    const now = ctx.currentTime;
    const freqs = [960, 1318.51, 987.77, 1567.98];
    const clampedVol = Math.min(1, Math.max(0.2, volume));

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);

      const start = now + idx * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(clampedVol * 0.72, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    });
  }

  public speakAlert(destinationName: string, distanceKm: number, lang: AlertLanguage, isFallback: boolean): void {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const distText = distanceKm.toFixed(1);
      let text = '';

      if (lang === 'hi') {
        text = isFallback
          ? `WakeMe Alert! Signal band hai, par estimated time ke hisaab se aap ${destinationName} ke paas pahunch gaye hain. Kripya uthiye!`
          : `WakeMe Alert! Aap ${destinationName} se sirf ${distText} kilometer door hain. Kripya uthiye!`;
      } else if (lang === 'mr') {
        text = isFallback
          ? `WakeMe Alert! Signal band aahe, pan andaje velenusar tumhi ${destinationName} jawal pohochla aahat. Krupaya utha!`
          : `WakeMe Alert! Tumhi ${destinationName} pasun fakt ${distText} kilometer antaravar aahat. Krupaya utha!`;
      } else {
        text = isFallback
          ? `WakeMe Dead Reckoning Alert! Signal was lost, and based on your speed and stops you should now be approaching ${destinationName}. Please wake up!`
          : `WakeMe Alert! You are approaching ${destinationName}. ${distText} kilometers remaining. Please wake up!`;
      }

      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
      utter.rate = 0.96;
      utter.pitch = 1.05;
      utter.volume = 1.0;
      window.speechSynthesis.speak(utter);
    } catch {
      // Speech unsupported
    }
  }

  public sendSystemNotification(title: string, body: string): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const vibrate = [700, 180, 700, 180, 900];
      if (navigator.serviceWorker?.controller) {
        void navigator.serviceWorker.ready.then((reg) =>
          reg.showNotification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'wakeme-destination-alert',
            requireInteraction: true,
            vibrate,
          } as NotificationOptions)
        );
      } else {
        new Notification(title, {
          body,
          icon: '/icon-192.png',
          tag: 'wakeme-destination-alert',
          requireInteraction: true,
        });
      }
    } catch {
      // Ignore notification failures in unsupported contexts
    }
  }

  public triggerAlarm(params: {
    destinationName: string;
    distanceKm: number;
    isFallback: boolean;
    prefs: UserPreferences;
  }): void {
    this.stopAlarm();
    this.active = true;
    const { destinationName, distanceKm, isFallback, prefs } = params;
    this.ensureAudioElements();

    if (prefs.soundEnabled && this.alarmAudioEl) {
      this.alarmAudioEl.volume = Math.min(1, Math.max(0.25, prefs.alarmVolume));
      this.alarmAudioEl.currentTime = 0;
      void this.alarmAudioEl.play().catch(() => {});
    }

    const fireOnce = () => {
      if (!this.active) return;
      if (prefs.soundEnabled) {
        this.playDualToneChime(prefs.alarmVolume);
      }
      if (prefs.vibrationEnabled && 'vibrate' in navigator) {
        try {
          navigator.vibrate([800, 200, 800, 200, 1000]);
        } catch {
          // Ignore
        }
      }
    };

    fireOnce();

    if (prefs.voiceAlertEnabled) {
      window.setTimeout(() => {
        if (this.active) {
          this.speakAlert(destinationName, distanceKm, prefs.voiceLanguage, isFallback);
        }
      }, 450);
    }

    this.sendSystemNotification(
      isFallback ? `WakeMe Fallback Alert: ${destinationName}` : `WakeMe: Approaching ${destinationName}`,
      isFallback
        ? 'Estimated arrival reached during signal drop. Check your stop!'
        : `Only ${distanceKm.toFixed(2)} km remaining to ${destinationName}.`
    );

    // Continuous chime + vibration loop every 2.2s while alarm overlay is active
    this.pulseTimer = window.setInterval(() => {
      fireOnce();
    }, 2200);

    // Repeat voice announcement at user-configured interval if enabled
    if (prefs.repeatAlertEnabled && prefs.voiceAlertEnabled) {
      const intervalMs = Math.max(8, prefs.repeatIntervalSec) * 1000;
      this.repeatTimer = window.setInterval(() => {
        if (!this.active) return;
        this.speakAlert(destinationName, distanceKm, prefs.voiceLanguage, isFallback);
      }, intervalMs);
    }
  }

  public getDiagnostics() {
    const voicesCount =
      typeof window !== 'undefined' && 'speechSynthesis' in window
        ? window.speechSynthesis.getVoices().length
        : 0;
    return {
      audioContextSupported:
        typeof window !== 'undefined' &&
        Boolean(
          window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        ),
      audioContextState: this.audioCtx?.state ?? 'uninitialized',
      htmlAudioReady: Boolean(this.alarmAudioEl),
      keepAliveActive: this.keepAliveActive,
      isRinging: this.active,
      vibrationSupported: typeof navigator !== 'undefined' && 'vibrate' in navigator,
      geolocationSupported: typeof navigator !== 'undefined' && 'geolocation' in navigator,
      wakeLockSupported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
      mediaSessionSupported: typeof navigator !== 'undefined' && 'mediaSession' in navigator,
      speechSynthesisSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
      voicesCount,
      notificationPermission:
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : ('unsupported' as const),
    };
  }

  public stopAlarm(): void {
    this.active = false;
    if (this.alarmAudioEl) {
      try {
        this.alarmAudioEl.pause();
        this.alarmAudioEl.currentTime = 0;
      } catch {
        // Ignore
      }
    }
    if (this.pulseTimer !== null) {
      clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
    if (this.repeatTimer !== null) {
      clearInterval(this.repeatTimer);
      this.repeatTimer = null;
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore
      }
    }
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }
}

export const alertEngine = new WakeMeAlertEngine();
