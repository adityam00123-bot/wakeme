import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  Briefcase,
  Bus,
  ChevronRight,
  Edit3,
  GraduationCap,
  Home,
  MapPin,
  Plus,
  Radio,
  Search,
  Star,
  Train,
  TrainFront,
  Trash2,
} from 'lucide-react';
import { MUMBAI_PRESET_ROUTES, getStationById } from '../data/mumbaiLocal';
import { Destination, DestinationCategory, MumbaiPresetRoute } from '../types/wakeme';

interface HomeScreenProps {
  destinations: Destination[];
  hasActiveJourney: boolean;
  onGoToAdd: () => void;
  onStartWithDestination: (dest: Destination) => void;
  onStartPresetRoute: (route: MumbaiPresetRoute) => void;
  onResumeJourney: () => void;
  onToggleFavourite: (id: string) => void;
  onDeleteDestination: (id: string) => void;
  onRenameDestination: (id: string, newName: string) => void;
}

function getCategoryIcon(cat: DestinationCategory) {
  switch (cat) {
    case 'Home':
      return Home;
    case 'College':
      return GraduationCap;
    case 'Office':
      return Briefcase;
    case 'Station':
      return TrainFront;
    default:
      return MapPin;
  }
}

function getLineTag(line: string) {
  if (line === 'Express') return { code: 'EXP', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-400/35' };
  if (line === 'Bus') return { code: 'BUS', cls: 'bg-rose-500/20 text-rose-300 border-rose-400/35' };
  if (line === 'Western') return { code: 'WR', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/30' };
  if (line === 'Central') return { code: 'CR', cls: 'bg-amber-500/15 text-amber-300 border-amber-400/30' };
  if (line === 'Harbour') return { code: 'HB', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' };
  return { code: 'LOC', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30' };
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  destinations,
  hasActiveJourney,
  onGoToAdd,
  onStartWithDestination,
  onStartPresetRoute,
  onResumeJourney,
  onToggleFavourite,
  onDeleteDestination,
  onRenameDestination,
}) => {
  const [search, setSearch] = useState('');
  const [corridorScope, setCorridorScope] = useState<'long_distance' | 'local'>('long_distance');
  const [filter, setFilter] = useState<'All' | 'Favourites' | 'Long-Distance' | 'Local'>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const quickShortcuts = useMemo(
    () =>
      [...destinations]
        .sort((a, b) => Number(b.favourite_status) - Number(a.favourite_status))
        .slice(0, 4),
    [destinations]
  );

  const visibleRoutes = useMemo(
    () => MUMBAI_PRESET_ROUTES.filter((r) => r.scope === corridorScope),
    [corridorScope]
  );

  const filteredDestinations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return destinations
      .filter((d) => {
        if (filter === 'Favourites' && !d.favourite_status) return false;
        if (filter === 'Long-Distance' && d.line !== 'Express' && d.line !== 'Bus') return false;
        if (filter === 'Local' && d.line !== 'Central' && d.line !== 'Western' && d.line !== 'Harbour') {
          return false;
        }
        if (!q) return true;
        return (
          d.destination_name.toLowerCase().includes(q) ||
          (d.subtitle || '').toLowerCase().includes(q) ||
          d.line.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => Number(b.favourite_status) - Number(a.favourite_status));
  }, [destinations, search, filter]);

  return (
    <div className="space-y-5">
      {/* Live Journey Resume Banner */}
      {hasActiveJourney && (
        <button
          type="button"
          onClick={onResumeJourney}
          className="pressable flex w-full items-center justify-between rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3.5 text-left"
        >
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 animate-pulse text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-emerald-200">WakeMe is monitoring your stop</p>
              <p className="text-xs text-emerald-300/80">Tap to open live radar &amp; fallback countdown</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-emerald-300" />
        </button>
      )}

      {/* Primary Commuter Launcher Card (Clean App Home — No Cluttered Startup Map) */}
      <section className="rounded-3xl border border-white/[0.08] bg-[#0e1524] p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-extrabold tracking-[-0.025em] text-white">
              Sleep safe on the move
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Set a GPS + Dead-Reckoning stop alarm for overnight trains, buses, or local commutes.
            </p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
            <BellRing className="h-5 w-5" />
          </span>
        </div>

        {/* Search / Add Destination Bar */}
        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex flex-1 items-center">
            <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Pune, Nashik, Dadar, Thane…"
              className="w-full rounded-2xl border border-white/10 bg-[#05070b] py-3 pl-10 pr-3 text-base text-white placeholder-slate-400 outline-none focus:border-cyan-400/60 sm:text-sm"
            />
          </div>
          <button
            type="button"
            onClick={onGoToAdd}
            className="pressable inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-2xl bg-cyan-400 px-3.5 text-xs font-bold text-slate-950 hover:bg-cyan-300"
          >
            <Plus className="h-4 w-4" />
            Add Stop
          </button>
        </div>

        {/* 1-Tap Quick Shortcuts */}
        {quickShortcuts.length > 0 && (
          <div className="mt-3.5 grid grid-cols-4 gap-2">
            {quickShortcuts.map((dest) => {
              const Icon = getCategoryIcon(dest.category);
              const shortLabel = dest.destination_name.split(' ')[0];
              return (
                <button
                  key={dest.destination_id}
                  type="button"
                  onClick={() => onStartWithDestination(dest)}
                  className="pressable flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-white/[0.07] bg-[#090e1a] px-2 py-2 text-center hover:border-cyan-400/40"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.06] text-cyan-300">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="w-full truncate text-[11px] font-semibold text-slate-200">
                    {shortLabel}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Journey Routes: Long-Distance (Default) + Mumbai Local */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-[-0.01em] text-white">
            Quick route presets
          </h2>
          <div className="flex rounded-xl border border-white/[0.08] bg-[#0e1524] p-0.5">
            <button
              type="button"
              onClick={() => setCorridorScope('long_distance')}
              className={`pressable inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                corridorScope === 'long_distance'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Train className="h-3 w-3" />
              Long-Distance
            </button>
            <button
              type="button"
              onClick={() => setCorridorScope('local')}
              className={`pressable inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                corridorScope === 'local'
                  ? 'bg-cyan-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrainFront className="h-3 w-3" />
              Mumbai Local
            </button>
          </div>
        </div>

        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1524]">
          {visibleRoutes.map((route) => {
            const first = getStationById(route.stationIds[0]);
            const last = getStationById(route.stationIds[route.stationIds.length - 1]);
            const badge = getLineTag(route.line);
            const isBus = route.line === 'Bus';

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onStartPresetRoute(route)}
                className="pressable flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[11px] font-bold ${badge.cls}`}
                  >
                    {isBus ? <Bus className="h-4 w-4" /> : badge.code}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{route.title}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {first?.code} to {last?.code} · {route.stationIds.length} stops ·{' '}
                      <span className="tabular-nums">{route.avgSpeedKmh} km/h</span>
                      {route.highlightNote ? ` · ${route.highlightNote}` : ''}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Saved Destinations */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-[-0.01em] text-white">
            Saved destinations ({destinations.length})
          </h2>
        </div>

        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {(['All', 'Favourites', 'Long-Distance', 'Local'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`pressable shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                filter === tab
                  ? 'bg-cyan-400 text-slate-950'
                  : 'border border-white/[0.08] bg-[#0e1524] text-slate-300 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {filteredDestinations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#0e1524]/60 p-6 text-center">
            <p className="text-sm font-medium text-slate-300">No matching destinations found</p>
            <button
              type="button"
              onClick={onGoToAdd}
              className="pressable mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950"
            >
              Search or drop map pin
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1524]">
            {filteredDestinations.map((dest) => {
              const Icon = getCategoryIcon(dest.category);
              const badge = getLineTag(dest.line);
              const isEditing = editingId === dest.destination_id;

              return (
                <div key={dest.destination_id} className="px-4 py-3.5 hover:bg-white/[0.02]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-cyan-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-cyan-400 bg-[#05070b] px-2.5 py-1.5 text-base text-white outline-none sm:text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editValue.trim()) {
                                  onRenameDestination(dest.destination_id, editValue.trim());
                                }
                                setEditingId(null);
                              }}
                              className="pressable rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-semibold text-white">
                                {dest.destination_name}
                              </h3>
                              <span
                                className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}
                              >
                                {badge.code}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-xs text-slate-400">
                              {dest.subtitle || `${dest.line} · ${dest.category}`}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onToggleFavourite(dest.destination_id)}
                        aria-label={`Favourite ${dest.destination_name}`}
                        className="pressable flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06]"
                      >
                        <Star
                          className={`h-4 w-4 ${
                            dest.favourite_status ? 'fill-amber-400 text-amber-400' : 'text-slate-500'
                          }`}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(dest.destination_id);
                          setEditValue(dest.destination_name);
                        }}
                        aria-label={`Edit ${dest.destination_name}`}
                        className="pressable flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDestination(dest.destination_id)}
                        aria-label={`Delete ${dest.destination_name}`}
                        className="pressable flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between pl-12">
                    <span className="font-mono-num text-[11px] text-slate-500">
                      {dest.latitude.toFixed(4)}, {dest.longitude.toFixed(4)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onStartWithDestination(dest)}
                      className="pressable inline-flex items-center gap-1 rounded-xl bg-white/[0.07] px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400 hover:text-slate-950"
                    >
                      Set alert
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
