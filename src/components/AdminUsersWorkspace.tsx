import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Search, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import type { AuthorizedUser, ToastType } from '../types';
import { capitalizeFirst, deriveNameFromEmail, formatDateDDMMYY, isAdminEmail } from '../utils/tasklet';

export type PerUserDeletionScope = 'all' | 'before' | 'after';
type UserSortField = 'dateAdded' | 'name';
type SortDirection = 'asc' | 'desc';

interface AdminUsersWorkspaceProps {
  authorizedUsers: AuthorizedUser[];
  isAddUserModalOpen: boolean;
  onCloseAddUserModal: () => void;
  onAddUser: (user: { name: string; email: string }) => Promise<boolean>;
  onRemoveUser: (user: AuthorizedUser) => void;
  onClearUserData: (user: AuthorizedUser, scope: PerUserDeletionScope, refDate?: string) => Promise<void>;
  onNotify?: (message: string, type?: ToastType) => void;
}

function getTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function AdminUsersWorkspace({
  authorizedUsers,
  isAddUserModalOpen,
  onCloseAddUserModal,
  onAddUser,
  onRemoveUser,
  onClearUserData,
  onNotify,
}: AdminUsersWorkspaceProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [sortField, setSortField] = useState<UserSortField>('dateAdded');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const [clearTargetUser, setClearTargetUser] = useState<AuthorizedUser | null>(null);
  const [clearScope, setClearScope] = useState<PerUserDeletionScope>('all');
  const [clearRefDate, setClearRefDate] = useState<string>(getTodayDateString);
  const [isClearing, setIsClearing] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAddUserModalOpen) {
      setName('');
      setEmail('');
      setErrorMsg(null);
      window.setTimeout(() => nameInputRef.current?.focus(), 40);
    }
  }, [isAddUserModalOpen]);

  const nonAdminUsers = useMemo(
    () => authorizedUsers.filter((u) => !isAdminEmail(u.email)),
    [authorizedUsers]
  );

  const visibleUsers = useMemo(() => {
    const q = userSearchQuery.trim().toLowerCase();
    const filtered = nonAdminUsers.filter((u) => {
      if (!q) return true;
      const displayName = (u.name || deriveNameFromEmail(u.email, nonAdminUsers)).toLowerCase();
      return displayName.includes(q) || u.email.toLowerCase().includes(q);
    });

    return [...filtered].sort((a, b) => {
      if (sortField === 'name') {
        const nameA = (a.name || deriveNameFromEmail(a.email, nonAdminUsers)).toLowerCase();
        const nameB = (b.name || deriveNameFromEmail(b.email, nonAdminUsers)).toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      const timeA = a.createdAtISO ? new Date(a.createdAtISO).getTime() : 0;
      const timeB = b.createdAtISO ? new Date(b.createdAtISO).getTime() : 0;
      const safeA = Number.isNaN(timeA) ? 0 : timeA;
      const safeB = Number.isNaN(timeB) ? 0 : timeB;
      if (safeA !== safeB) {
        return sortDirection === 'asc' ? safeA - safeB : safeB - safeA;
      }
      const nameA = (a.name || deriveNameFromEmail(a.email, nonAdminUsers)).toLowerCase();
      const nameB = (b.name || deriveNameFromEmail(b.email, nonAdminUsers)).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [nonAdminUsers, userSearchQuery, sortField, sortDirection]);

  const handleToggleSort = (field: UserSortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const rawName = name.trim();
    const rawEmail = email.trim().toLowerCase();

    const failAdd = (msg: string) => {
      setErrorMsg(msg);
      onNotify?.(msg, 'error');
    };

    if (!rawName) {
      failAdd('Please enter the user’s Name.');
      nameInputRef.current?.focus();
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailPattern.test(rawEmail)) {
      failAdd('Please enter a valid Google, Gmail, or Google Workspace email.');
      return;
    }

    if (authorizedUsers.some((u) => u.email === rawEmail)) {
      failAdd(`${rawEmail} is already authorized.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const added = await onAddUser({
        name: capitalizeFirst(rawName),
        email: rawEmail,
      });
      if (added) {
        setName('');
        setEmail('');
        onCloseAddUserModal();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmClear = async () => {
    if (!clearTargetUser) return;
    setIsClearing(true);
    try {
      await onClearUserData(clearTargetUser, clearScope, clearScope === 'all' ? undefined : clearRefDate);
      setClearTargetUser(null);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <main className="flex-1 w-full px-3 sm:px-6 py-4 sm:py-6">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-7 space-y-4">
        {/* Users Header + Right-Aligned Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Users</h1>
              <span className="font-mono tabular-nums text-xs font-semibold text-emerald-700">
                ({visibleUsers.length}
                {userSearchQuery.trim() ? ` of ${nonAdminUsers.length}` : ''})
              </span>
            </div>
          </div>

          <div className="relative w-full sm:w-64 sm:ml-auto">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              value={userSearchQuery}
              onChange={(e) => setUserSearchQuery(e.target.value)}
              placeholder="Search users..."
              aria-label="Search users"
              className="w-full pl-8 pr-8 py-1.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-sm text-slate-900 placeholder-slate-400 bg-white outline-none transition"
            />
            {userSearchQuery && (
              <button
                type="button"
                onClick={() => setUserSearchQuery('')}
                aria-label="Clear user search"
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Users Table / Listing */}
        <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white">
          {/* Users Column Header with Sort Options */}
          <div className="px-4 py-2.5 bg-slate-50/90 border-b border-slate-200/80 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-500 mr-1">Users:</span>
              <button
                type="button"
                onClick={() => handleToggleSort('dateAdded')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 cursor-pointer ${
                  sortField === 'dateAdded'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <span>Date Added</span>
                {sortField === 'dateAdded' &&
                  (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
              <button
                type="button"
                onClick={() => handleToggleSort('name')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1 cursor-pointer ${
                  sortField === 'name'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <span>Name</span>
                {sortField === 'name' &&
                  (sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
              </button>
            </div>
            <span className="hidden sm:inline text-xs font-semibold text-slate-500">Actions</span>
          </div>

          {visibleUsers.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-slate-500">
              {userSearchQuery.trim()
                ? 'No users match your search.'
                : 'No team members added yet. Tap the + button at the top right to add a user.'}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {visibleUsers.map((u) => {
                const displayName = u.name || deriveNameFromEmail(u.email, nonAdminUsers);
                return (
                  <li
                    key={u.email}
                    className="px-3.5 sm:px-4 py-3 flex items-center justify-between gap-2"
                  >
                    <div className="w-[80%] flex-1 min-w-0">
                      <p
                        title={displayName}
                        className="text-sm font-semibold text-slate-900 truncate cursor-default"
                      >
                        {displayName}
                      </p>
                      <div className="flex items-center gap-x-1.5 text-xs text-slate-500 min-w-0">
                        <span title={u.email} className="truncate">
                          {u.email}
                        </span>
                        {u.createdAtISO && (
                          <span className="hidden sm:inline-flex items-center gap-x-1.5 shrink-0 font-mono tabular-nums text-[11px] text-slate-400">
                            <span aria-hidden="true">·</span>
                            <span>Added {formatDateDDMMYY(u.createdAtISO)}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-1 shrink-0">
                      <button
                        type="button"
                        title="Clear Data"
                        aria-label={`Clear data for ${displayName}`}
                        onClick={() => {
                          setClearTargetUser(u);
                          setClearScope('all');
                          setClearRefDate(getTodayDateString());
                        }}
                        className="p-2 rounded-lg border border-rose-200/90 bg-rose-50 hover:bg-rose-100 text-rose-600 transition flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Remove User"
                        aria-label={`Remove ${displayName}`}
                        onClick={() => onRemoveUser(u)}
                        className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 transition flex items-center justify-center cursor-pointer"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Add User Dialog */}
      {isAddUserModalOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-user-modal-title"
        >
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden sm:my-auto">
            <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <UserPlus className="w-4 h-4" />
                </div>
                <h2 id="add-user-modal-title" className="text-base font-bold text-slate-900">
                  Add Authorized User
                </h2>
              </div>
              <button
                type="button"
                onClick={onCloseAddUserModal}
                aria-label="Close modal"
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4" noValidate>
              <div>
                <label htmlFor="admin-user-name-input" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  id="admin-user-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(capitalizeFirst(e.target.value))}
                  placeholder="e.g., Arjun Sharma"
                  maxLength={100}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 outline-none transition"
                  required
                />
              </div>

              <div>
                <label htmlFor="admin-user-email-input" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Google / Gmail / Workspace Email <span className="text-rose-500">*</span>
                </label>
                <input
                  id="admin-user-email-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., arjun@spmniwas.in"
                  maxLength={160}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 outline-none transition"
                  required
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onCloseAddUserModal}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{isSubmitting ? 'Adding...' : 'Add User'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Per-User Clear Data Modal */}
      {clearTargetUser && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-user-data-title"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 id="clear-user-data-title" className="text-base font-bold text-slate-900">
                Clear Data · {clearTargetUser.name}
              </h3>
              <button
                type="button"
                onClick={() => setClearTargetUser(null)}
                aria-label="Close modal"
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Permanently delete tasklets created by{' '}
                <span className="font-semibold text-slate-900">{clearTargetUser.email}</span>. Tasklet contents remain hidden.
              </p>

              <div>
                <label htmlFor="per-user-clear-scope" className="block text-xs font-semibold text-slate-600 mb-1.5">
                  Deletion Scope
                </label>
                <select
                  id="per-user-clear-scope"
                  value={clearScope}
                  onChange={(e) => setClearScope(e.target.value as PerUserDeletionScope)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-sm text-slate-900 bg-white outline-none transition"
                >
                  <option value="all">Clear ALL tasklets for this user</option>
                  <option value="before">Delete tasklets on or before selected date</option>
                  <option value="after">Delete tasklets from selected date onwards</option>
                </select>
              </div>

              {clearScope !== 'all' && (
                <div>
                  <label htmlFor="per-user-clear-date" className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Reference Date
                  </label>
                  <input
                    id="per-user-clear-date"
                    type="date"
                    value={clearRefDate}
                    onChange={(e) => setClearRefDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 text-sm text-slate-900 outline-none transition"
                  />
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setClearTargetUser(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isClearing || (clearScope !== 'all' && !clearRefDate)}
                  onClick={() => void handleConfirmClear()}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-sm font-semibold shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isClearing ? 'Deleting...' : 'Delete User Data'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
