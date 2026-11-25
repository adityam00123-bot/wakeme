import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  ChevronRight,
  Edit3,
  GraduationCap,
  Home,
  MapPin,
  MoreHorizontal,
  Radio,
  Search,
  Star,
  TrainFront,
  Trash2,
} from 'lucide-react';
import { MUMBAI_PRESET_ROUTES } from '../data/mumbaiLocal';
import { Destination, DestinationCategory, MumbaiPresetRoute } from '../types/wakeme';

interface HomeScreenProps {
  destinations: Destination[];
  hasActiveJourney: boolean;
  onGoToSearch: () => void;
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
  destinations,
  hasActiveJourney,
  onGoToSearch,
  onStartWithDestination,
  onStartPresetRoute,
  onResumeJourney,
  onToggleFavourite,
  onDeleteDestination,
  onRenameDestination,
}) => {
  const [corridorScope, setCorridorScope] = useState<'long_distance' | 'local'>('long_distance');
  const [showAllRoutes, setShowAllRoutes] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const quickPins = useMemo(
    () =>
      [...destinations]
        .sort((a, b) => Number(b.favourite_status) - Number(a.favourite_status))
        .slice(0, 4),
    [destinations]
  );

  const scopedRoutes = useMemo(
    () => MUMBAI_PRESET_ROUTES.filter((r) => r.scope === corridorScope),
    [corridorScope]
  );
  const visibleRoutes = showAllRoutes ? scopedRoutes : scopedRoutes.slice(0, 3);

  const sortedSaved = useMemo(
    () =>
      [...destinations].sort(
        (a, b) => Number(b.favourite_status) - Number(a.favourite_status)
      ),
    [destinations]
  );

  return (
    <div className="space-y-6">
      {/* Live Journey Return Banner (Only when a trip is active) */}
      {hasActiveJourney && (
        <button
          type="button"
          onClick={onResumeJourney}
          className="pressable flex w-full items-center justify-between rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3.5 text-left dark:bg-emerald-500/15"
        >
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 animate-pulse text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">
                Trip alert is active
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300/80">
                Tap to view live tracking
              </p>
            </div>
          </div>
          <ChevronRight className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
        </button>
      )}

      {/* SECTION 1: Hero Primary Action ("Where are you going?") */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
        <h1 className="text-2xl font-extrabold tracking-[-0.03em] text-slate-900 dark:text-white">
          Where are you going?
        </h1>

        <button
          type="button"
          onClick={onGoToSearch}
          className="pressable mt-3.5 flex w-full items-center gap-3 rounded-2xl bg-[#edf1f7] px-4 py-3.5 text-left text-slate-500 hover:bg-slate-200/80 dark:bg-[#1c2331] dark:text-slate-400 dark:hover:bg-[#232b3b]"
        >
          <Search className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium">Search station, city, or drop pin…</span>
        </button>

        {quickPins.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-2">
            {quickPins.map((dest) => {
              const Icon = getCategoryIcon(dest.category);
              const cleaned = dest.destination_name.replace(/\s*\(.*?\)\s*/g, '').replace(/\s+(Station|Junction)$/i, '').trim();
              const shortName = cleaned.length > 15 ? cleaned.slice(0, 14).trim() + '…' : cleaned;
              return (
                <button
                  key={dest.destination_id}
                  type="button"
                  onClick={() => onStartWithDestination(dest)}
                  className="pressable inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:border-blue-500/40 hover:text-blue-600 dark:border-white/[0.08] dark:bg-[#1c2331] dark:text-slate-200 dark:hover:border-blue-400/40 dark:hover:text-blue-300"
                >
                  <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  {shortName}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: Popular Routes (3 Clean Rows + Long-Distance / Local Switch) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-bold tracking-[-0.015em] text-slate-900 dark:text-white">
            Popular routes
          </h2>

          <div className="inline-flex rounded-xl bg-[#edf1f7] p-1 dark:bg-[#141923]">
            <button
              type="button"
              onClick={() => {
                setCorridorScope('long_distance');
                setShowAllRoutes(false);
              }}
              className={`pressable rounded-lg px-3 py-1.5 text-xs font-semibold ${
                corridorScope === 'long_distance'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Long-Distance
            </button>
            <button
              type="button"
              onClick={() => {
                setCorridorScope('local');
                setShowAllRoutes(false);
              }}
              className={`pressable rounded-lg px-3 py-1.5 text-xs font-semibold ${
                corridorScope === 'local'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-blue-600 dark:text-white'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Local
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
          {visibleRoutes.map((route) => {
            const [mainTitle, subLabel] = route.title.includes('(')
              ? [route.title.split('(')[0].trim(), route.title.split('(')[1].replace(')', '')]
              : [route.title, route.line];

            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onStartPresetRoute(route)}
                className="pressable flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {mainTitle}
                    </p>
                    <span className="shrink-0 rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      {route.line === 'Bus' ? 'Bus' : route.scope === 'long_distance' ? 'Express' : route.line}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {subLabel} · {route.defaultAlertKm} km alert
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>

        {scopedRoutes.length > 3 && (
          <button
            type="button"
            onClick={() => setShowAllRoutes((v) => !v)}
            className="w-full py-1 text-center text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            {showAllRoutes ? 'Show fewer routes' : `View all ${scopedRoutes.length} routes`}
          </button>
        )}
      </section>

      {/* SECTION 3: Saved Places (Clean Compact Rows — Progressive Disclosure) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-[-0.015em] text-slate-900 dark:text-white">
            Saved places
          </h2>
          <button
            type="button"
            onClick={onGoToSearch}
            className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
          >
            + Add new
          </button>
        </div>

        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-[#141923] dark:shadow-none">
          {sortedSaved.map((dest) => {
            const Icon = getCategoryIcon(dest.category);
            const isEditing = editingId === dest.destination_id;
            const isMenuOpen = menuOpenId === dest.destination_id;

            return (
              <div key={dest.destination_id} className="px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#edf1f7] text-blue-600 dark:bg-[#1c2331] dark:text-blue-400">
                      <Icon className="h-4 w-4" />
                    </span>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="w-full rounded-lg border border-blue-500 bg-white px-2.5 py-1.5 text-base text-slate-900 outline-none sm:text-sm dark:bg-[#0a0d12] dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              if (editValue.trim()) {
                                onRenameDestination(dest.destination_id, editValue.trim());
                              }
                              setEditingId(null);
                              setMenuOpenId(null);
                            }}
                            className="pressable rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <>
                          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {dest.destination_name}
                          </h3>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {dest.subtitle || `${dest.line} · ${dest.category}`}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onToggleFavourite(dest.destination_id)}
                      aria-label={`Favourite ${dest.destination_name}`}
                      className="pressable flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                    >
                      <Star
                        className={`h-4 w-4 ${
                          dest.favourite_status
                            ? 'fill-amber-400 text-amber-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => setMenuOpenId(isMenuOpen ? null : dest.destination_id)}
                      aria-label={`More options for ${dest.destination_name}`}
                      className="pressable flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => onStartWithDestination(dest)}
                      className="pressable rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                    >
                      Start
                    </button>
                  </div>
                </div>

                {/* Progressive Disclosure Actions (Edit / Delete) */}
                {isMenuOpen && !isEditing && (
                  <div className="mt-2.5 flex justify-end gap-2 border-t border-slate-100 pt-2.5 dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(dest.destination_id);
                        setEditValue(dest.destination_name);
                      }}
                      className="pressable inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/[0.05]"
                    >
                      <Edit3 className="h-3 w-3" />
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteDestination(dest.destination_id);
                        setMenuOpenId(null);
                      }}
                      className="pressable inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:text-rose-300 dark:hover:bg-rose-500/15"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
