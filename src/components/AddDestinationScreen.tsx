import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader2, MapPin, Search, Star, WifiOff } from 'lucide-react';
import { MUMBAI_STATIONS } from '../data/mumbaiLocal';
import { SearchPlaceResult, searchPlacesHybrid } from '../services/geoEngine';
import { Destination, DestinationCategory, MumbaiLine } from '../types/wakeme';
import { LiveMap } from './LiveMap';

interface AddDestinationScreenProps {
  userId: string;
  onBack: () => void;
  onSaveDestination: (dest: Destination, startImmediately: boolean) => void;
}

export const AddDestinationScreen: React.FC<AddDestinationScreenProps> = ({
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
  const [line, setLine] = useState<MumbaiLine>('Central');
  const [lat, setLat] = useState(19.0185); // Default Dadar
  const [lng, setLng] = useState(72.8435);
  const [favourite, setFavourite] = useState(true);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(
        MUMBAI_STATIONS.filter((s) => s.isMajor)
          .slice(0, 6)
          .map((s) => ({
            id: s.id,
            name: s.name,
            subtitle: `${s.line} Line (${s.code}) • Offline Ready`,
            lat: s.lat,
            lng: s.lng,
            source: 'Mumbai Local (Offline)',
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
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectResult = (item: SearchPlaceResult) => {
    setName(item.name);
    setSubtitle(item.subtitle);
    setLat(item.lat);
    setLng(item.lng);
    if (item.line) setLine(item.line);
    setCategory(item.source.includes('Mumbai Local') ? 'Station' : 'Custom');
  };

  const handleMapTap = (pickedLat: number, pickedLng: number) => {
    setLat(pickedLat);
    setLng(pickedLng);
    if (!name.trim()) {
      setName('Pinned Mumbai Stop');
    }
    setSubtitle(`Custom Pin (${pickedLat.toFixed(4)}, ${pickedLng.toFixed(4)})`);
  };

  const handleSave = (startImmediately: boolean) => {
    const finalName = name.trim() || 'Custom Stop';
    const dest: Destination = {
      destination_id: `dest-${Date.now().toString(36)}`,
      user_id: userId,
      destination_name: finalName,
      subtitle: subtitle.trim() || `${line} • ${category}`,
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
    <div className="space-y-4 pb-28">
      <header className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <h1 className="text-sm font-bold text-white">Add Destination (FR-02)</h1>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-medium text-slate-400">
          {!navigator.onLine ? <WifiOff className="h-3 w-3 text-amber-400" /> : null}
          {navigator.onLine ? 'OSM + Offline' : 'Offline Stations'}
        </span>
      </header>

      {/* Search Box */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Mumbai station, college, or place..."
          className="w-full rounded-2xl border border-slate-800 bg-slate-900 py-3 pl-10 pr-10 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
        />
        {searching && (
          <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-400" />
        )}
      </div>

      {/* Quick Search Suggestions */}
      {results.length > 0 && (
        <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-2xl border border-slate-800/90 bg-slate-900/70 p-2">
          {results.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectResult(item)}
              className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition hover:bg-slate-800"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white">{item.name}</p>
                <p className="truncate text-[11px] text-slate-400">{item.subtitle}</p>
              </div>
              <span className="shrink-0 rounded-md border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-medium text-cyan-300">
                {item.source === 'Mumbai Local (Offline)' ? 'Station' : 'OSM'}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Interactive Pin Map */}
      <LiveMap
        centerLat={lat}
        centerLng={lng}
        destLat={lat}
        destLng={lng}
        destName={name || 'Selected Pin'}
        alertRadiusKm={1.5}
        interactivePinMode
        onMapClick={handleMapTap}
        className="h-52 w-full"
        zoom={12}
      />

      {/* Details Form */}
      <div className="space-y-3 rounded-2xl border border-slate-800/90 bg-slate-900/75 p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300">
            <MapPin className="h-3.5 w-3.5" />
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </span>
          <button
            type="button"
            onClick={() => setFavourite((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
              favourite
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-700 bg-slate-900 text-slate-400'
            }`}
          >
            <Star className={`h-3 w-3 ${favourite ? 'fill-amber-400 text-amber-400' : ''}`} />
            Favourite
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-300">Destination Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Dadar Station / VJTI College"
            className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DestinationCategory)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500"
            >
              <option value="Station">Station</option>
              <option value="Home">Home</option>
              <option value="College">College</option>
              <option value="Office">Office</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-300">Corridor / Line</label>
            <select
              value={line}
              onChange={(e) => setLine(e.target.value as MumbaiLine)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-500"
            >
              <option value="Central">Central</option>
              <option value="Western">Western</option>
              <option value="Harbour">Harbour</option>
              <option value="Metro / Bus">Metro / Bus</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-3 text-xs font-bold text-white transition active:scale-95"
          >
            <Check className="h-4 w-4 text-cyan-400" />
            Save Only
          </button>
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition active:scale-95"
          >
            Save &amp; Start
          </button>
        </div>
      </div>
    </div>
  );
};
