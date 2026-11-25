import React, { useState } from 'react';
import { BellRing, ChevronsRight, Clock, Radio, Volume2 } from 'lucide-react';
import { alertEngine } from '../services/alertEngine';
import { AlertLanguage } from '../types/wakeme';

interface AlarmOverlayProps {
  destinationName: string;
  distanceKm: number;
  isFallbackTrigger: boolean;
  voiceLang: AlertLanguage;
  onSnooze: () => void;
  onDismiss: () => void;
}

export const AlarmOverlay: React.FC<AlarmOverlayProps> = ({
  destinationName,
  distanceKm,
  isFallbackTrigger,
  voiceLang,
  onSnooze,
  onDismiss,
}) => {
  const [slideVal, setSlideVal] = useState(0);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSlideVal(val);
    if (val >= 90) {
      onDismiss();
    }
  };

  return (
    <div className="animate-alarm-flash fixed inset-0 z-[9999] flex flex-col justify-between p-6 text-white backdrop-blur-md">
      <div className="flex flex-col items-center pt-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-4 py-1.5 text-xs font-semibold text-amber-200">
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          {isFallbackTrigger
            ? 'Dead-Reckoning ETA Fallback Triggered'
            : 'GPS Proximity Threshold Reached'}
        </span>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="relative mb-6 flex h-32 w-32 items-center justify-center">
          <span className="animate-radar-ping absolute inset-0 rounded-full bg-white/30" />
          <span className="animate-radar-ping absolute inset-3 rounded-full bg-amber-300/35 [animation-delay:0.4s]" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/60 bg-black/50 shadow-2xl">
            <BellRing className="h-11 w-11 animate-bounce text-amber-300" />
          </div>
        </div>

        <p className="text-sm font-semibold text-white/85">Wake up — Approaching stop</p>
        <h1 className="mt-2 max-w-sm text-3xl font-extrabold leading-tight tracking-[-0.03em] text-white">
          {destinationName}
        </h1>
        <div className="mt-3 rounded-2xl border border-white/25 bg-black/40 px-5 py-2.5">
          <span className="font-mono-num text-2xl font-bold text-amber-300">
            {isFallbackTrigger ? 'ETA Reached' : `${distanceKm.toFixed(2)} km away`}
          </span>
        </div>

        {isFallbackTrigger && (
          <p className="mt-3 max-w-xs text-xs leading-relaxed text-amber-100/90">
            Signal dropped earlier — WakeMe computed arrival from your last speed and stops buffer.
          </p>
        )}
      </div>

      <div className="mx-auto w-full max-w-sm space-y-3 pb-4">
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => alertEngine.speakAlert(destinationName, distanceKm, voiceLang, isFallbackTrigger)}
            className="pressable flex items-center justify-center gap-2 rounded-2xl border border-white/25 bg-black/40 py-3 text-xs font-semibold text-white"
          >
            <Volume2 className="h-4 w-4" />
            Repeat voice
          </button>
          <button
            type="button"
            onClick={onSnooze}
            className="pressable flex items-center justify-center gap-2 rounded-2xl border border-amber-300/40 bg-amber-500/30 py-3 text-xs font-semibold text-amber-100"
          >
            <Clock className="h-4 w-4" />
            Snooze 30s
          </button>
        </div>

        <div className="relative flex h-16 select-none items-center overflow-hidden rounded-full border-2 border-white/40 bg-black/45 px-2">
          <div
            className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-emerald-500/40 transition-[width] duration-75"
            style={{ width: `${slideVal}%` }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-bold text-white">
            <ChevronsRight className="h-5 w-5 animate-pulse" />
            Slide right to stop alarm
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={slideVal}
            onChange={handleSliderChange}
            onMouseUp={() => {
              if (slideVal < 90) setSlideVal(0);
            }}
            onTouchEnd={() => {
              if (slideVal < 90) setSlideVal(0);
            }}
            aria-label="Slide right to stop alarm"
            className="relative z-10 h-full w-full cursor-pointer opacity-0"
          />
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-2 text-center text-xs font-medium text-white/80 underline underline-offset-4 hover:text-white"
        >
          Tap here to stop alarm and end journey
        </button>
      </div>
    </div>
  );
};
