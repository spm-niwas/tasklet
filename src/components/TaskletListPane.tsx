import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ClipboardList, Clock, Search, X } from 'lucide-react';
import type { EffectiveStatus, FilterTab, Tasklet, TaskletListScope } from '../types';
import { formatDeadline, getEffectiveStatus, ITEMS_PER_PAGE } from '../utils/tasklet';

interface TaskletListPaneProps {
  tasklets: Tasklet[];
  currentUserEmail: string;
  listScope: TaskletListScope;
  activeFilter: FilterTab;
  searchQuery: string;
  currentPage: number;
  selectedId: string | null;
  statusCounts: Record<FilterTab, number>;
  nowMs: number;
  isLoading: boolean;
  isVisibleOnMobile: boolean;
  onSelectListScope: (scope: TaskletListScope) => void;
  onSearchChange: (val: string) => void;
  onSelectFilter: (filter: FilterTab) => void;
  onSelectTasklet: (id: string) => void;
  onPageChange: (page: number) => void;
  onOpenAddModal: () => void;
}

const SCOPE_OPTIONS: Array<{ value: TaskletListScope; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'mine', label: 'Mine' },
];
const FIRST_LINE_TABS: FilterTab[] = ['All', 'Active'];
const SECOND_LINE_TABS: FilterTab[] = ['Overdue', 'Abandoned', 'Closed'];

function getStatusBadgeStyle(status: EffectiveStatus): string {
  switch (status) {
    case 'Overdue':
      return 'bg-rose-50 text-rose-700 border border-rose-200/80';
    case 'Active':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200/80';
    case 'Closed':
      return 'bg-slate-100 text-slate-700 border border-slate-200';
    case 'Abandoned':
      return 'bg-amber-50 text-amber-800 border border-amber-200/80';
  }
}

export function TaskletListPane({
  tasklets,
  currentUserEmail,
  listScope,
  activeFilter,
  searchQuery,
  currentPage,
  selectedId,
  statusCounts,
  nowMs,
  isLoading,
  isVisibleOnMobile,
  onSelectListScope,
  onSearchChange,
  onSelectFilter,
  onSelectTasklet,
  onPageChange,
  onOpenAddModal,
}: TaskletListPaneProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 20);
    }
  }, [isSearchOpen]);

  const totalItems = tasklets.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * ITEMS_PER_PAGE;
  const pageItems = tasklets.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const showSearchInput = isSearchOpen;

  const handleToggleSearch = () => {
    if (isSearchOpen) {
      if (searchQuery) {
        onSearchChange('');
      }
      setIsSearchOpen(false);
    } else {
      setIsSearchOpen(true);
    }
  };

  const handleTabClick = (tab: FilterTab) => {
    if (isSearchOpen) {
      setIsSearchOpen(false);
    }
    if (searchQuery) {
      onSearchChange('');
    }
    onSelectFilter(tab);
  };

  const renderFilterTabButton = (tab: FilterTab) => {
    const isActive = activeFilter === tab;
    const count = statusCounts[tab] ?? 0;

    let activeStyle = 'bg-emerald-600 text-white shadow-sm';
    let countStyle = 'text-slate-500';

    if (isActive) {
      if (tab === 'All') activeStyle = 'bg-blue-600 text-white shadow-sm';
      else if (tab === 'Overdue') activeStyle = 'bg-rose-600 text-white shadow-sm';
      else if (tab === 'Abandoned') activeStyle = 'bg-amber-600 text-white shadow-sm';
      else if (tab === 'Closed') activeStyle = 'bg-slate-800 text-white shadow-sm';
      countStyle = 'text-white/90';
    } else if (tab === 'Overdue' && count > 0) {
      countStyle = 'text-rose-700 font-bold';
    }

    return (
      <button
        key={tab}
        type="button"
        onClick={() => handleTabClick(tab)}
        className={`sm:flex-1 justify-center px-2 sm:px-2.5 py-2 sm:py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
          isActive ? activeStyle : 'text-slate-600 hover:text-slate-900 hover:bg-white'
        }`}
      >
        <span className="truncate">{tab}</span>
        <span className={`font-mono tabular-nums text-[11px] font-semibold shrink-0 ${countStyle}`}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <section
      className={`${
        isVisibleOnMobile ? 'flex' : 'hidden lg:flex'
      } w-full lg:w-[45%] bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden flex-col`}
    >
      {/* Top Scope Radio Section */}
      <div className="px-2.5 sm:px-3 py-2.5 bg-emerald-50/45 border-b border-emerald-200/80 shrink-0">
        <div
          role="radiogroup"
          aria-label="Tasklet ownership filter"
          className="grid grid-cols-3 gap-1.5 w-full"
        >
          {SCOPE_OPTIONS.map((opt) => {
            const checked = listScope === opt.value;
            return (
              <label
                key={opt.value}
                className={`px-2 py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer select-none ${
                  checked
                    ? 'bg-white border-emerald-500 text-emerald-800 shadow-2xs'
                    : 'bg-white/75 border-emerald-200/70 text-slate-600 hover:bg-white hover:text-slate-900'
                }`}
              >
                <input
                  type="radio"
                  name="tasklet-list-scope"
                  value={opt.value}
                  checked={checked}
                  onChange={() => onSelectListScope(opt.value)}
                  className="w-3.5 h-3.5 accent-emerald-600 shrink-0 cursor-pointer"
                />
                <span className="truncate">{opt.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Search & Status Tabs Section */}
      <div className="p-2.5 sm:p-3 border-b border-slate-200/80 bg-slate-50/80 shrink-0 space-y-2">
        <div className="grid grid-cols-3 sm:flex sm:items-center gap-1.5 w-full">
          {/* First tab: Search */}
          <button
            type="button"
            onClick={handleToggleSearch}
            aria-expanded={showSearchInput}
            className={`sm:flex-1 justify-center px-2 sm:px-2.5 py-2 sm:py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
              showSearchInput
                ? 'bg-slate-900 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white'
            }`}
          >
            <Search className="w-3.5 h-3.5 shrink-0" />
            <span>Search</span>
          </button>

          {/* Remaining Row 1 tabs: All, Active */}
          {FIRST_LINE_TABS.map(renderFilterTabButton)}

          {/* Row 2 tabs on mobile: Overdue, Abandoned, Closed */}
          {SECOND_LINE_TABS.map(renderFilterTabButton)}
        </div>

        {/* Full-width expandable Search input when Search is clicked */}
        {showSearchInput && (
          <div className="w-full relative flex items-center gap-2">
            <div className="relative flex-1 w-full">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search by keyword, description, or #number..."
                aria-label="Search tasklets"
                className="w-full pl-10 pr-9 py-2.5 sm:py-2 bg-white text-base sm:text-sm text-slate-800 placeholder-slate-400 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchChange('');
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search text"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                setIsSearchOpen(false);
              }}
              className="px-3 py-2.5 sm:py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-600 shrink-0 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Tasklet List */}
      <div className="flex-1 divide-y divide-slate-100 min-h-[360px] sm:min-h-[440px] flex flex-col overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3, 4].map((skeleton) => (
              <div key={skeleton} className="p-3 rounded-xl bg-slate-50 border border-slate-100 animate-pulse space-y-2">
                <div className="h-4 w-3/4 bg-slate-200 rounded" />
                <div className="h-3 w-1/3 bg-slate-200 rounded" />
              </div>
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 my-auto">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6" strokeWidth={1.8} />
            </div>
            <p className="text-sm font-semibold text-slate-800">No tasklets found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              {searchQuery
                ? 'Try clearing your search query or switching status filter tabs.'
                : listScope === 'supervisor'
                ? 'No tasklets are assigned to you as Supervisor in this status tab.'
                : 'Create your first deadline tasklet to begin tracking progress.'}
            </p>
            {!searchQuery && listScope !== 'supervisor' && (
              <button
                type="button"
                onClick={onOpenAddModal}
                className="mt-4 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition cursor-pointer"
              >
                Add Tasklet
              </button>
            )}
          </div>
        ) : (
          pageItems.map((t) => {
            const eff = getEffectiveStatus(t, nowMs);
            const isSelected = t.id === selectedId;
            const overdue = eff === 'Overdue';
            const isSupervisorView =
              Boolean(t.createdByEmail) && t.createdByEmail.toLowerCase() !== currentUserEmail.toLowerCase();
            const visibilityLabel = isSupervisorView
              ? `Assigned by ${t.createdBy || 'Team Member'}`
              : t.visibility === 'supervisor' && t.supervisorName
              ? `Supervisor: ${t.supervisorName}`
              : 'Only me';

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTasklet(t.id)}
                className={`w-full text-left px-4 py-4 sm:py-3.5 transition flex items-start gap-3 cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200/80'
                    : 'hover:bg-slate-50/90 active:bg-slate-100/80'
                }`}
              >
                <span
                  className={`shrink-0 mt-0.5 px-2 py-0.5 rounded-lg text-xs font-mono tabular-nums font-semibold ${
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  #{t.seq}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 line-clamp-2 sm:truncate">{t.title}</p>
                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold ${getStatusBadgeStyle(eff)}`}
                    >
                      {eff}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <div
                        className={`flex items-center gap-1.5 text-xs font-mono tabular-nums ${
                          overdue ? 'text-rose-600 font-semibold' : 'text-slate-500 font-medium'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>{formatDeadline(t.deadlineISO)}</span>
                      </div>
                      <span className="text-[11px] font-medium text-slate-500 truncate">
                        {visibilityLabel}
                      </span>
                    </div>
                    <span className="lg:hidden text-[11px] font-semibold text-emerald-700 flex items-center gap-0.5 shrink-0">
                      Open
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Auto-Pagination Bar (shown only when items > 25) */}
      {totalItems > ITEMS_PER_PAGE && (
        <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 shrink-0">
          <span className="font-medium tabular-nums">
            Showing {startIndex + 1}–{Math.min(startIndex + ITEMS_PER_PAGE, totalItems)} of {totalItems}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => onPageChange(safePage - 1)}
              className="px-3.5 py-2 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none font-medium transition cursor-pointer"
            >
              Prev
            </button>
            <span className="px-2 font-mono tabular-nums font-semibold text-slate-700">
              {safePage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => onPageChange(safePage + 1)}
              className="px-3.5 py-2 sm:py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none font-medium transition cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
