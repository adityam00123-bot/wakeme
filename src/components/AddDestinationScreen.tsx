import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Crosshair,
  GraduationCap,
  Home,
  Loader2,
  Map as MapIcon,
  MapPin,
  Navigation,
  Search,
  Star,
  TrainFront,
  WifiOff,
  X,
} from 'lucide-react';
import { MUMBAI_STATIONS } from '../data/mumbaiLocal';
import {
  SearchPlaceResult,
  reverseGeocodeHybrid,
  searchPlacesHybrid,
} from '../services/geoEngine';
import { getCurrentPositionUnified, isGeoAvailable } from '../services/nativeGeo';
import { Destination, DestinationCategory, MumbaiLine } from '../types/wakeme';
import { LiveMap } from './LiveMap';

interface AddDestinationScreenProps {
  theme: 'light' | 'dark';
  userId: string;
  onBack: () => void;
  onSaveDestination: (dest: Destination, startImmediately: boolean) => void;
}

type SearchFilter = 'All' | 'Express' | 'Bus' | 'Local';

export const AddDestinationScreen: React.FC<AddDestinationScreenProps> = ({
  theme,
  userId,
  onBack,
  onSaveDestination,
}) => {
  const [step, setStep] = useState<'search' | 'map'>('search');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SearchFilter>('All');
  const [results, setResults] = useState<SearchPlaceResult[]>([]);
  const [searching, setSearching] = useState(false);

  // Selected / Map Confirm state
  const [name, setName] = useState('Pune Junction');
  const [subtitle, setSubtitle] = useState('Express (PUNE) · Offline Ready');
  const [category, setCategory] = useState<DestinationCategory>('Station');
  const [line, setLine] = useState<MumbaiLine>('Express');
  const [lat, setLat] = useState(18.5289);
  const [lng, setLng] = useState(73.8744);
  const [favourite, setFavourite] = useState(true);

  // Center-pin drag & reverse-geocode state
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const [locatingMe, setLocatingMe] = useState(false);
  const lastAnchoredCoordsRef = useRef<{ lat: number; lng: number }>({ lat: 18.5289, lng: 73.8744 });
  const reverseTimerRef = useRef<number | null>(null);
  const searchReqIdRef = useRef(0);
  const reverseReqIdRef = useRef(0);
  const [geoErrMsg, setGeoErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    const reqId = ++searchReqIdRef.current;
    if (!trimmed) {
      const defaults: SearchPlaceResult[] = MUMBAI_STATIONS.filter((s) => s.isMajor).map((s) => ({
        id: s.id,
        name: s.name,
        subtitle: `${s.line} (${s.code}) · Offline Ready`,
        lat: s.lat,
        lng: s.lng,
        source: 'Offline Junction DB',
        line: s.line,
      }));
      setResults(defaults);
      setSearching(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      const found = await searchPlacesHybrid(trimmed);
      if (searchReqIdRef.current !== reqId) return;
      setResults(found);
      setSearching(false);
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  const filteredResults = useMemo(() => {
    if (filter === 'All') return results;
    if (filter === 'Express') return results.filter((r) => r.line === 'Express');
    if (filter === 'Bus') return results.filter((r) => r.line === 'Bus');
    return results.filter((r) => r.line === 'Central' || r.line === 'Western' || r.line === 'Harbour');
  }, [results, filter]);

  const handleSelectSearchResult = (item: SearchPlaceResult) => {
    lastAnchoredCoordsRef.current = { lat: item.lat, lng: item.lng };
    setName(item.name);
    setSubtitle(item.subtitle);
    setLat(item.lat);
    setLng(item.lng);
    if (item.line) setLine(item.line);
    setCategory(item.source === 'Offline Junction DB' ? 'Station' : 'Custom');
    setStep('map');
  };

  const handleOpenMapMode = () => {
    lastAnchoredCoordsRef.current = { lat, lng };
    setStep('map');
  };

  const handleMapMoveStart = () => {
    setIsDraggingMap(true);
    if (reverseTimerRef.current !== null) {
      clearTimeout(reverseTimerRef.current);
      reverseTimerRef.current = null;
    }
  };

  const handleMapMoveEnd = (newLat: number, newLng: number) => {
    setIsDraggingMap(false);
    setLat(newLat);
    setLng(newLng);

    const distMoved =
      Math.abs(newLat - lastAnchoredCoordsRef.current.lat) +
      Math.abs(newLng - lastAnchoredCoordsRef.current.lng);
    if (distMoved < 0.0012) {
      return;
    }
    lastAnchoredCoordsRef.current = { lat: newLat, lng: newLng };

    const reqId = ++reverseReqIdRef.current;
    setResolvingPlace(true);
    if (reverseTimerRef.current !== null) {
      clearTimeout(reverseTimerRef.current);
    }
    reverseTimerRef.current = window.setTimeout(async () => {
      const resolved = await reverseGeocodeHybrid(newLat, newLng);
      if (reverseReqIdRef.current !== reqId) return;
      setName(resolved.name);
      setSubtitle(resolved.subtitle);
      setResolvingPlace(false);
    }, 260);
  };

  const handleLocateMe = () => {
    if (!isGeoAvailable()) {
      setGeoErrMsg('GPS unavailable on this device');
      return;
    }
    setLocatingMe(true);
    setGeoErrMsg(null);
    void getCurrentPositionUnified(6000)
      .then(async (pos) => {
        if (reverseTimerRef.current !== null) {
          clearTimeout(reverseTimerRef.current);
          reverseTimerRef.current = null;
        }
        lastAnchoredCoordsRef.current = { lat: pos.latitude, lng: pos.longitude };
        setLat(pos.latitude);
        setLng(pos.longitude);
        setLocatingMe(false);
        const reqId = ++reverseReqIdRef.current;
        setResolvingPlace(true);
        const resolved = await reverseGeocodeHybrid(pos.latitude, pos.longitude);
        if (reverseReqIdRef.current === reqId) {
          setName(resolved.name);
          setSubtitle(resolved.subtitle);
          setResolvingPlace(false);
        }
      })
      .catch((err: { message?: string }) => {
        setGeoErrMsg(err?.message || 'Unable to lock GPS location');
        setLocatingMe(false);
      });
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

  // ==============================================================
  // STEP 1: CLEAN AUTOCOMPLETE SEARCH LIST (Uber / Maps Pattern)
  // ==============================================================
  if (step === 'search') {
    return (
      <div className="space-y-4">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to home"
              className="pressable flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-slate-900 dark:border-white/10 dark:bg-[#141923] dark:text-slate-300 dark:hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-bold tracking-[-0.02em] text-slate-900 dark:text-white">
              Where to?
            </h1>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-[#141923] dark:text-slate-300">
            {!navigator.onLine ? <WifiOff className="h-3 w-3 text-amber-500" /> : null}
            {navigator.onLine ? 'Online + Offline' : 'Offline Stations'}
          </span>
        </header>

        {/* Focused Search Input */}
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-blue-600 dark:text-blue-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search station, city, or landmark…"
            className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-10 text-base text-slate-900 placeholder-slate-400 shadow-xs outline-none focus:border-blue-500 sm:text-sm dark:border-white/10 dark:bg-[#141923] dark:text-white dark:shadow-none"
          />
          {searching ? (
            <Loader2 className="absolute right-3.5 h-4 w-4 animate-spin text-blue-500" />
          ) : query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="pressable absolute right-3 flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-white/10 dark:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {/* Uber-style "Choose on Map" Row */}
        <button
          type="button"
          onClick={handleOpenMapMode}
          className="pressable flex w-full items-center justify-between rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 text-left shadow-xs hover:border-blue-400/50 dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
              <MapIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Set location on map
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pan map to drop a pin anywhere
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400" />
        </button>

        {/* Clean Filter Chips */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {(['All', 'Express', 'Bus', 'Local'] as const).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setFilter(chip)}
              className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                filter === chip
                  ? 'bg-blue-600 text-white dark:bg-blue-500'
                  : 'border border-slate-200 bg-white text-slate-600 dark:border-white/[0.08] dark:bg-[#141923] dark:text-slate-300'
              }`}
            >
              {chip === 'Local' ? 'Mumbai Local' : chip}
            </button>
          ))}
        </div>

        {/* Suggestions List */}
        {filteredResults.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center dark:border-white/10 dark:bg-[#141923]">
            <p className="text-sm font-semibold text-slate-800 dark:text-white">
              No exact match for &ldquo;{query}&rdquo;
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Try Pune, Nashik, Surat, Dadar — or pick directly on the map.
            </p>
            <button
              type="button"
              onClick={handleOpenMapMode}
              className="pressable mt-3.5 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white dark:bg-blue-500"
            >
              <MapPin className="h-3.5 w-3.5" />
              Set location on map
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
            {filteredResults.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelectSearchResult(item)}
                className="pressable flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf1f7] text-blue-600 dark:bg-[#1c2331] dark:text-blue-400">
                    {item.source === 'Offline Junction DB' ? (
                      <TrainFront className="h-4 w-4" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {item.subtitle}
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ==============================================================
  // STEP 2: UBER / GOOGLE MAPS PIN-DROP & CONFIRM SHEET
  // ==============================================================
  const categoryOptions: Array<{ id: DestinationCategory; icon: typeof Home }> = [
    { id: 'Station', icon: TrainFront },
    { id: 'Home', icon: Home },
    { id: 'College', icon: GraduationCap },
    { id: 'Office', icon: Briefcase },
  ];

  return (
    <div className="space-y-4">
      {/* Top Bar: Back to Search + Search Pill + Locate Me */}
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setStep('search')}
          aria-label="Back to search list"
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:text-slate-900 dark:border-white/10 dark:bg-[#141923] dark:text-slate-300 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={() => setStep('search')}
          className="pressable flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-left dark:border-white/10 dark:bg-[#141923]"
        >
          <Search className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            {name || 'Search another stop…'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleLocateMe}
          disabled={locatingMe}
          aria-label="Center map on my GPS location"
          className="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600 dark:border-white/10 dark:bg-[#141923] dark:text-blue-400"
        >
          {locatingMe ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Crosshair className="h-4 w-4" />
          )}
        </button>
      </header>

      {geoErrMsg && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
          {geoErrMsg}
        </p>
      )}

      {/* Spacious Map Canvas with Center Crosshair Pin Overlay */}
      <div className="relative overflow-hidden rounded-3xl border border-slate-200 shadow-sm dark:border-white/[0.08]">
        <LiveMap
          theme={theme}
          centerLat={lat}
          centerLng={lng}
          destLat={lat}
          destLng={lng}
          destName={name}
          alertRadiusKm={2.0}
          interactivePinMode
          centerCrosshairMode
          onMapMoveStart={handleMapMoveStart}
          onMapMoveEnd={handleMapMoveEnd}
          className="h-[42dvh] min-h-[260px] w-full rounded-none border-0"
          zoom={12.5}
        />

        {/* Uber-style Static Center Pin (Lifts on Drag, Lands on Stop!) */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-white shadow-xl transition-transform duration-150 dark:bg-blue-500 ${
                isDraggingMap ? '-translate-y-3 scale-110' : '-translate-y-1.5 scale-100'
              }`}
            >
              <MapPin className="h-5 w-5" />
            </div>
            {/* Ground shadow dot */}
            <span
              className={`mt-0.5 h-1.5 rounded-full bg-slate-900/50 blur-[1px] transition-all duration-150 dark:bg-black/70 ${
                isDraggingMap ? 'w-2 opacity-40' : 'w-3.5 opacity-80'
              }`}
            />
          </div>
        </div>
      </div>

      {/* Confirmation Sheet */}
      <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Destination name"
              className="w-full bg-transparent text-lg font-bold tracking-[-0.02em] text-slate-900 outline-none focus:underline dark:text-white"
            />
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {isDraggingMap
                ? 'Release map to drop pin…'
                : resolvingPlace
                ? 'Resolving place name…'
                : subtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setFavourite((v) => !v)}
            aria-label="Toggle favourite"
            className={`pressable flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
              favourite
                ? 'border-amber-300 bg-amber-50 text-amber-500 dark:border-amber-400/40 dark:bg-amber-500/15'
                : 'border-slate-200 bg-[#f5f7fa] text-slate-400 dark:border-white/10 dark:bg-[#0a0d12]'
            }`}
          >
            <Star className={`h-4 w-4 ${favourite ? 'fill-amber-400' : ''}`} />
          </button>
        </div>

        {/* Tactile Label Pills (Replaces clunky dropdowns) */}
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((opt) => {
            const Icon = opt.icon;
            const active = category === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setCategory(opt.id)}
                className={`pressable inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'border-slate-200 bg-[#f5f7fa] text-slate-600 dark:border-white/10 dark:bg-[#0a0d12] dark:text-slate-400'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {opt.id}
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={() => handleSave(true)}
            className="pressable flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <Navigation className="h-4 w-4" />
            Confirm &amp; Start Trip
          </button>
          <button
            type="button"
            onClick={() => handleSave(false)}
            className="pressable w-full rounded-xl py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            Save to Places only
          </button>
        </div>
      </div>
    </div>
  );
};
