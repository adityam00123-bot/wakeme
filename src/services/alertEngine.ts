import { AlertLanguage, UserPreferences } from '../types/wakeme';

class WakeMeAlertEngine {
  private audioCtx: AudioContext | null = null;
  private pulseTimer: number | null = null;
  private repeatTimer: number | null = null;
  private wakeLockSentinel: WakeLockSentinel | null = null;
  private active = false;

  /**
   * Call during a user tap ("Start Journey" / "Test Alarm") so browsers unlock Web Audio.
   */
  public unlockAudio(): void {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }
    } catch {
      // AudioContext unavailable
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
    const freqs = [880, 1174.66, 987.77, 1318.51];

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.16);

      const start = now + idx * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(Math.min(1, Math.max(0.1, volume)) * 0.5, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
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
          ? `WakeMe Alert! Network band hai, par estimated time ke hisaab se aap ${destinationName} ke paas pahunch gaye hain. Kripya uthiye!`
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
      if (navigator.serviceWorker?.controller) {
        void navigator.serviceWorker.ready.then((reg) =>
          reg.showNotification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'wakeme-destination-alert',
            requireInteraction: true,
          })
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

    const fireOnce = () => {
      if (!this.active) return;
      if (prefs.soundEnabled) {
        this.playDualToneChime(prefs.alarmVolume);
      }
      if (prefs.vibrationEnabled && 'vibrate' in navigator) {
        try {
          navigator.vibrate([500, 150, 500, 150, 750]);
        } catch {
          // Ignore
        }
      }
    };

    fireOnce();

    if (prefs.voiceAlertEnabled) {
      this.speakAlert(destinationName, distanceKm, prefs.voiceLanguage, isFallback);
    }

    this.sendSystemNotification(
      isFallback ? `⚠️ WakeMe Fallback Alert: ${destinationName}` : `🔔 WakeMe: Approaching ${destinationName}`,
      isFallback
        ? 'Estimated arrival reached during signal drop. Check your stop!'
        : `Only ${distanceKm.toFixed(2)} km remaining to ${destinationName}.`
    );

    // Rapid chime + vibration loop every 2.4s while alarm overlay is active
    this.pulseTimer = window.setInterval(() => {
      fireOnce();
    }, 2400);

    // Repeat voice announcement at user-configured interval if enabled
    if (prefs.repeatAlertEnabled && prefs.voiceAlertEnabled) {
      const intervalMs = Math.max(8, prefs.repeatIntervalSec) * 1000;
      this.repeatTimer = window.setInterval(() => {
        if (!this.active) return;
        this.speakAlert(destinationName, distanceKm, prefs.voiceLanguage, isFallback);
      }, intervalMs);
    }
  }

  public stopAlarm(): void {
    this.active = false;
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
