import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Briefcase,
  ChevronRight,
  Edit3,
  GraduationCap,
  Home,
  MapPin,
  Plus,
  Radio,
  Search,
  Star,
  TrainFront,
  Trash2,
} from 'lucide-react';
import { MUMBAI_PRESET_ROUTES, getStationById } from '../data/mumbaiLocal';
import { Destination, DestinationCategory, MumbaiPresetRoute } from '../types/wakeme';

interface HomeScreenProps {
  destinations: Destination[];
  hasActiveJourney: boolean;
  previewDestinationId?: string | null;
  onGoToAdd: () => void;
  onPreviewDestination: (dest: Destination) => void;
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
  if (line === 'Western') return { code: 'WR', cls: 'bg-sky-500/15 text-sky-300 border-sky-400/30' };
  if (line === 'Central') return { code: 'CR', cls: 'bg-amber-500/15 text-amber-300 border-amber-400/30' };
  if (line === 'Harbour') return { code: 'HB', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' };
  return { code: 'LOC', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30' };
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  destinations,
  hasActiveJourney,
  previewDestinationId,
  onGoToAdd,
  onPreviewDestination,
  onStartWithDestination,
  onStartPresetRoute,
  onResumeJourney,
  onToggleFavourite,
  onDeleteDestination,
  onRenameDestination,
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Favourites' | 'Central' | 'Western' | 'Harbour'>('All');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const quickShortcuts = useMemo(
    () =>
      [...destinations]
        .sort((a, b) => Number(b.favourite_status) - Number(a.favourite_status))
        .slice(0, 4),
    [destinations]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return destinations
      .filter((d) => {
        if (filter === 'Favourites' && !d.favourite_status) return false;
        if (['Central', 'Western', 'Harbour'].includes(filter) && d.line !== filter) return false;
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
    <div className="space-y-6">
      {/* Live Journey Resume Strip */}
      {hasActiveJourney && (
        <button
          type="button"
          onClick={onResumeJourney}
          className="pressable flex w-full items-center justify-between rounded-2xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-3">
            <Radio className="h-4 w-4 animate-pulse text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-emerald-200">WakeMe is monitoring your stop</p>
              <p className="text-xs text-emerald-300/80">Open live radar &amp; fallback timer</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-emerald-300" />
        </button>
      )}

      {/* Conversational Destination Prompt (Citymapper / Uber Pattern) */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-bold tracking-[-0.025em] text-white">
            Where are you getting off?
          </h1>
          <button
            type="button"
            onClick={onGoToAdd}
            className="pressable inline-flex items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/20"
          >
            <Plus className="h-3.5 w-3.5" />
            Drop pin
          </button>
        </div>

        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-4 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter saved stops or search stations…"
            className="w-full rounded-2xl border border-white/10 bg-[#11192b] py-3.5 pl-11 pr-4 text-base text-white placeholder-slate-400 outline-none transition-colors focus:border-cyan-400/60 sm:text-sm"
          />
        </div>

        {/* 1-Tap Quick Commute Shortcuts */}
        {quickShortcuts.length > 0 && (
          <div className="grid grid-cols-4 gap-2 pt-1">
            {quickShortcuts.map((dest) => {
              const Icon = getCategoryIcon(dest.category);
              const shortLabel = dest.destination_name.split(' ')[0];
              const isSelected = previewDestinationId === dest.destination_id;
              return (
                <button
                  key={dest.destination_id}
                  type="button"
                  onClick={() => onStartWithDestination(dest)}
                  onMouseEnter={() => onPreviewDestination(dest)}
                  className={`pressable flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-2.5 text-center ${
                    isSelected
                      ? 'border-cyan-400/50 bg-cyan-400/12 text-white'
                      : 'border-white/[0.07] bg-[#0e1524] text-slate-200 hover:border-white/15 hover:bg-[#131d31]'
                  }`}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-cyan-300">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="w-full truncate text-xs font-semibold">{shortLabel}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Mumbai Local Live Corridors */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-slate-200">
            Mumbai Local corridors
          </h2>
          <span className="text-xs text-slate-400">Instant demo routes</span>
        </div>

        <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1524]">
          {MUMBAI_PRESET_ROUTES.map((route) => {
            const first = getStationById(route.stationIds[0]);
            const last = getStationById(route.stationIds[route.stationIds.length - 1]);
            const badge = getLineTag(route.line);

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onStartPresetRoute(route)}
                className="pressable flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/[0.03]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-xs font-bold ${badge.cls}`}
                  >
                    {badge.code}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{route.title}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {first?.code} to {last?.code} · {route.stationIds.length} stops ·{' '}
                      <span className="tabular-nums">{route.avgSpeedKmh} km/h</span>
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>
      </section>

      {/* Saved Destinations List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-[-0.01em] text-slate-200">
            Saved stops ({destinations.length})
          </h2>
        </div>

        {/* Clean Filter Pills */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {(['All', 'Favourites', 'Central', 'Western', 'Harbour'] as const).map((tab) => (
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

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#0e1524]/60 p-6 text-center">
            <p className="text-sm font-medium text-slate-300">No saved stops match "{search}"</p>
            <button
              type="button"
              onClick={onGoToAdd}
              className="pressable mt-3 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950"
            >
              Search or drop pin
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e1524]">
            {filtered.map((dest) => {
              const Icon = getCategoryIcon(dest.category);
              const badge = getLineTag(dest.line);
              const isEditing = editingId === dest.destination_id;
              const isPreviewed = previewDestinationId === dest.destination_id;

              return (
                <div
                  key={dest.destination_id}
                  onClick={() => onPreviewDestination(dest)}
                  className={`cursor-pointer px-4 py-3.5 transition-colors ${
                    isPreviewed ? 'bg-cyan-400/[0.06]' : 'hover:bg-white/[0.025]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] text-cyan-300">
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div
                            className="flex items-center gap-2"
                            onClick={(e) => e.stopPropagation()}
                          >
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

                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
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

                  <div
                    className="mt-2.5 flex items-center justify-between pl-12"
                    onClick={(e) => e.stopPropagation()}
                  >
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
