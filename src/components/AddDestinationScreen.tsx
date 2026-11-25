import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, MapPin, Search, Star, WifiOff } from 'lucide-react';
import { MUMBAI_STATIONS } from '../data/mumbaiLocal';
import { SearchPlaceResult, searchPlacesHybrid } from '../services/geoEngine';
import { Destination, DestinationCategory, MumbaiLine } from '../types/wakeme';
import { LiveMap } from './LiveMap';

interface AddDestinationScreenProps {
  theme: 'light' | 'dark';
  userId: string;
  onBack: () => void;
  onSaveDestination: (dest: Destination, startImmediately: boolean) => void;
}

export const AddDestinationScreen: React.FC<AddDestinationScreenProps> = ({
  theme,
  userId,
  onBack,
  onSaveDestination,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchPlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [category, setCategory] = useState<DestinationCategory>('Station');
  const [line, setLine] = useState<MumbaiLine>('Express');
  const [lat, setLat] = useState(18.5289);
  const [lng, setLng] = useState(73.8744);
  const [favourite, setFavourite] = useState(true);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(
        MUMBAI_STATIONS.filter((s) => s.isMajor)
          .slice(0, 8)
          .map((s) => ({
            id: s.id,
            name: s.name,
            subtitle: `${s.line} (${s.code}) · Offline Ready`,
            lat: s.lat,
            lng: s.lng,
            source: 'Offline Junction DB',
            line: s.line,
          }))
      );
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchPlacesHybrid(trimmed);
      setResults(found);
      setSearching(false);
    }, 320);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectResult = (item: SearchPlaceResult) => {
    setName(item.name);
    setSubtitle(item.subtitle);
    setLat(item.lat);
    setLng(item.lng);
    if (item.line) setLine(item.line);
    setCategory(item.source === 'Offline Junction DB' ? 'Station' : 'Custom');
  };

  const handleMapTap = (pickedLat: number, pickedLng: number) => {
    setLat(pickedLat);
    setLng(pickedLng);
    if (!name.trim()) {
      setName('Pinned Stop');
    }
    setSubtitle(`Custom Pin (${pickedLat.toFixed(4)}, ${pickedLng.toFixed(4)})`);
  };

  const handleSave = (startImmediately: boolean) => {
    const finalName = name.trim() || 'Pinned Stop';
    const dest: Destination = {
      destination_id: `dest-${Date.now().toString(36)}`,
      user_id: userId,
      destination_name: finalName,
      subtitle: subtitle.trim() || `${line} · ${category}`,
      category,
      line,
      latitude: lat,
      longitude: lng,
      favourite_status: favourite,
      created_at: new Date().toISOString(),
      last_used_at: startImmediately ? new Date().toISOString() : undefined,
    };
    onSaveDestination(dest, startImmediately);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to home"
            className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-slate-900 dark:border-white/10 dark:bg-[#141923] dark:text-slate-300 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              Search &amp; Add Stop
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Search any city/station or tap the map
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-[#141923] dark:text-slate-300">
          {!navigator.onLine ? <WifiOff className="h-3 w-3 text-amber-500" /> : null}
          {navigator.onLine ? 'OSM + Offline' : 'Offline DB'}
        </span>
      </header>

      {/* Search Box */}
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Pune, Surat, Goa, Borivali, Dadar…"
          className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-10 text-base text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 sm:text-sm dark:border-white/10 dark:bg-[#141923] dark:text-white"
        />
        {searching && <Loader2 className="absolute right-4 h-4 w-4 animate-spin text-blue-500" />}
      </div>

      {/* Results List */}
      {results.length > 0 && (
        <div className="clean-scroll max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#141923]">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectResult(item)}
              className="pressable flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {item.name}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {item.subtitle}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[#edf1f7] px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-[#1c2331] dark:text-blue-300">
                {item.source === 'Offline Junction DB' ? 'Station' : 'OSM'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <LiveMap
        theme={theme}
        centerLat={lat}
        centerLng={lng}
        destLat={lat}
        destLng={lng}
        destName={name || 'Selected Pin'}
        alertRadiusKm={2.0}
        interactivePinMode
        onMapClick={handleMapTap}
        className="h-52 w-full"
        zoom={11}
      />

      {/* Details Form */}
      <div className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#141923]">
        <div className="flex items-center justify-between">
          <span className="font-mono-num inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
            <MapPin className="h-3.5 w-3.5" />
            {lat.toFixed(4)}, {lng.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={() => setFavourite((v) => !v)}
            className={`pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
              favourite
                ? 'border-amber-400/50 bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'
                : 'border-slate-200 bg-[#edf1f7] text-slate-500 dark:border-white/10 dark:bg-[#1c2331] dark:text-slate-400'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${favourite ? 'fill-amber-400 text-amber-400' : ''}`} />
            Favourite
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
            Destination name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Pune Junction or Dadar Station"
            className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3.5 py-2.5 text-base text-slate-900 outline-none focus:border-blue-500 sm:text-sm dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DestinationCategory)}
              className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
            >
              <option value="Station">Station</option>
              <option value="Home">Home</option>
              <option value="College">College</option>
              <option value="Office">Office</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Corridor
            </label>
            <select
              value={line}
              onChange={(e) => setLine(e.target.value as MumbaiLine)}
              className="w-full rounded-xl border border-slate-200 bg-[#f5f7fa] px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-[#0a0d12] dark:text-white"
            >
              <option value="Express">Express Train</option>
              <option value="Bus">Intercity Bus</option>
              <option value="Central">Central Local</option>
              <option value="Western">Western Local</option>
              <option value="Harbour">Harbour Local</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-[#edf1f7] py-3 text-xs font-bold text-slate-800 hover:bg-slate-200 dark:border-white/10 dark:bg-[#1c2331] dark:text-white"
          >
            <Check className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            Save Only
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="pressable inline-flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-3 text-xs font-bold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            Save &amp; Start
          </button>
        </div>
      </div>
    </div>
  );
};
