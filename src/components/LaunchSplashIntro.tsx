import React, { useEffect, useState } from 'react';
import { BellRing, Navigation, Radio } from 'lucide-react';

interface LaunchSplashIntroProps {
  onComplete: () => void;
}

export const LaunchSplashIntro: React.FC<LaunchSplashIntroProps> = ({ onComplete }) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const exitDelayMs = reduced ? 320 : 1480;
    const doneDelayMs = reduced ? 540 : 1780;

    const exitTimer = window.setTimeout(() => setExiting(true), exitDelayMs);
    const doneTimer = window.setTimeout(() => onComplete(), doneDelayMs);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, [onComplete]);

  return (
    <div
      aria-label="Launching WakeMe"
      className={`fixed inset-0 z-[9998] flex flex-col items-center justify-between overflow-hidden bg-[#0A0D12] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-white transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.2,0,0,1)] ${
        exiting ? 'pointer-events-none scale-[1.03] opacity-0' : 'scale-100 opacity-100'
      }`}
    >
      {/* Subtle top ambience line */}
      <div className="flex w-full justify-center pt-4">
        <span className="splash-chip-enter inline-flex items-center gap-1.5 rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-blue-300">
          <Radio className="h-3 w-3 animate-pulse text-emerald-400" />
          Mumbai Transit GPS Guard
        </span>
      </div>

      {/* Center Kinetic Route + Emblem Stage */}
      <div className="relative flex w-full max-w-xs flex-col items-center">
        {/* Animated express transit corridor arc */}
        <svg
          viewBox="0 0 280 96"
          className="mb-1 h-24 w-full overflow-visible"
          aria-hidden="true"
        >
          {/* Dim base rail track */}
          <path
            d="M 18 66 Q 140 12 262 56"
            fill="none"
            stroke="rgba(59,130,246,0.18)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="6 6"
          />
          {/* High-speed illuminated corridor trace */}
          <path
            d="M 18 66 Q 140 12 262 56"
            fill="none"
            stroke="url(#wakeme-splash-grad)"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="splash-route-draw"
          />
          {/* Origin station beacon */}
          <circle cx="18" cy="66" r="5" fill="#10B981" />
          <circle cx="18" cy="66" r="10" fill="rgba(16,185,129,0.22)" />
          {/* Destination geofence alert ring */}
          <circle cx="262" cy="56" r="6" fill="#3B82F6" />
          <circle cx="262" cy="56" r="14" fill="none" stroke="rgba(59,130,246,0.45)" strokeWidth="1.5" className="splash-ping-sm" />
          <defs>
            <linearGradient id="wakeme-splash-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="55%" stopColor="#3B82F6" />
              <stop offset="100%" stopColor="#F59E0B" />
            </linearGradient>
          </defs>
        </svg>

        {/* Central Rapido-style kinetic emblem */}
        <div className="relative -mt-6 flex h-24 w-24 items-center justify-center">
          <span className="splash-radar-ring absolute inset-0 rounded-full border border-blue-400/50 bg-blue-500/15" />
          <span className="splash-radar-ring-delay absolute inset-1 rounded-full border border-emerald-400/35" />

          <div className="splash-emblem-enter relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-[26px] border border-white/15 bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 shadow-2xl shadow-blue-600/35">
            {/* Speed-streak sheen */}
            <span className="splash-sheen pointer-events-none absolute inset-y-0 -left-full w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
            <Navigation className="h-9 w-9 text-white drop-shadow" />
            <span className="absolute bottom-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[#0A0D12] shadow">
              <BellRing className="h-3 w-3" />
            </span>
          </div>
        </div>

        {/* Wordmark + Subtitle */}
        <h1 className="splash-title-enter mt-5 text-3xl font-extrabold tracking-[-0.03em] text-white">
          Wake<span className="text-blue-400">Me</span>
        </h1>
        <p className="splash-sub-enter mt-1.5 text-center text-xs font-medium text-slate-400">
          Sleep easy · Never miss your stop
        </p>
      </div>

      {/* Bottom speed-progress strip */}
      <div className="w-full max-w-[220px] space-y-2 pb-2 text-center">
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div className="splash-progress-fill h-full rounded-full bg-gradient-to-r from-emerald-400 via-blue-500 to-amber-400" />
        </div>
        <p className="text-[10px] font-medium tracking-wide text-slate-500">
          Initializing GPS &amp; Dead-Reckoning Guard
        </p>
      </div>
    </div>
  );
};
