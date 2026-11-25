import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  ChevronRight,
  Edit3,
  GraduationCap,
  Home,
  MapPin,
  Navigation,
  Plus,
  Search,
  Star,
  TrainFront,
  Trash2,
  User,
} from 'lucide-react';
import { MUMBAI_PRESET_ROUTES, getStationById } from '../data/mumbaiLocal';
import { Destination, DestinationCategory, MumbaiPresetRoute, UserProfile } from '../types/wakeme';

interface HomeScreenProps {
  user: UserProfile;
  destinations: Destination[];
  hasActiveJourney: boolean;
  onOpenAuth: () => void;
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

export const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  destinations,
  hasActiveJourney,
  onOpenAuth,
  onGoToAdd,
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
    <div className="space-y-5 pb-28">
      {/* Top App Bar */}
      <header className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Navigation className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight text-white">WakeMe</h1>
              <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-300">
                Mumbai Local
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Never Miss Your Destination</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenAuth}
          className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40"
        >
          <User className="h-3.5 w-3.5 text-cyan-400" />
          <span className="max-w-[92px] truncate">{user.name.split(' ')[0]}</span>
        </button>
      </header>

      {/* Active Journey Return Banner */}
      {hasActiveJourney && (
        <button
          type="button"
          onClick={onResumeJourney}
          className="flex w-full items-center justify-between rounded-2xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 text-left transition active:scale-[0.99]"
        >
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-400" />
            </span>
            <div>
              <p className="text-xs font-bold text-emerald-300">Journey Monitoring Active</p>
              <p className="text-[11px] text-emerald-100/80">Tap to open live radar & fallback monitor</p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-emerald-300" />
        </button>
      )}

      {/* Quick Mumbai Local Demo Routes */}
      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            1-Tap Mumbai Local Corridors
          </h2>
          <span className="text-[11px] font-medium text-cyan-400">Offline Ready</span>
        </div>

        <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
          {MUMBAI_PRESET_ROUTES.map((route) => {
            const first = getStationById(route.stationIds[0]);
            const last = getStationById(route.stationIds[route.stationIds.length - 1]);
            const lineAccent =
              route.line === 'Western'
                ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                : route.line === 'Central'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onStartPresetRoute(route)}
                className="min-w-[235px] shrink-0 rounded-2xl border border-slate-800/90 bg-slate-900/80 p-3.5 text-left transition hover:border-cyan-500/40 active:scale-[0.98]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${lineAccent}`}>
                    {route.line} • {route.trainType}
                  </span>
                  <span className="font-mono-num text-[11px] text-slate-400">
                    ~{route.avgSpeedKmh} km/h
                  </span>
                </div>
                <p className="mt-2 text-sm font-bold text-white">{route.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {first?.code} → {last?.code} • {route.stationIds.length} stations
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Search + Add Destination */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Saved Destinations ({destinations.length})
          </h2>
          <button
            type="button"
            onClick={onGoToAdd}
            className="inline-flex items-center gap-1 rounded-xl bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300 transition hover:bg-cyan-500/25 active:scale-95"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved stops (e.g., Thane, Dadar, Andheri)..."
            className="w-full rounded-2xl border border-slate-800 bg-slate-900/90 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Chips */}
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
          {(['All', 'Favourites', 'Central', 'Western', 'Harbour'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === tab
                  ? 'bg-cyan-500 text-slate-950'
                  : 'border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Destination List */}
        <div className="space-y-2.5">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-6 text-center">
              <p className="text-sm font-medium text-slate-300">No matching destinations</p>
              <button
                type="button"
                onClick={onGoToAdd}
                className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                + Add Mumbai Station or Pin
              </button>
            </div>
          ) : (
            filtered.map((dest) => {
              const Icon = getCategoryIcon(dest.category);
              const isEditing = editingId === dest.destination_id;

              return (
                <div
                  key={dest.destination_id}
                  className="rounded-2xl border border-slate-800/90 bg-slate-900/75 p-3.5 transition hover:border-slate-700"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-cyan-400">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full rounded-lg border border-cyan-500 bg-slate-950 px-2.5 py-1 text-sm text-white outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (editValue.trim()) {
                                  onRenameDestination(dest.destination_id, editValue.trim());
                                }
                                setEditingId(null);
                              }}
                              className="rounded-lg bg-cyan-500 px-2.5 py-1 text-xs font-bold text-slate-950"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <h3 className="truncate text-sm font-bold text-white">
                                {dest.destination_name}
                              </h3>
                            </div>
                            <p className="truncate text-[11px] text-slate-400">
                              {dest.subtitle || `${dest.line} • ${dest.category}`}
                            </p>
                            <p className="font-mono-num mt-1 text-[10px] text-slate-500">
                              {dest.latitude.toFixed(4)}, {dest.longitude.toFixed(4)}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onToggleFavourite(dest.destination_id)}
                        aria-label="Toggle favourite"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800"
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
                        aria-label="Edit destination"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteDestination(dest.destination_id)}
                        aria-label="Delete destination"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-800/70 pt-2.5">
                    <span className="rounded-md bg-slate-800/90 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {dest.line}
                    </span>
                    <button
                      type="button"
                      onClick={() => onStartWithDestination(dest)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-cyan-500/15 transition active:scale-95"
                    >
                      Set Alert &amp; Go
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
};
