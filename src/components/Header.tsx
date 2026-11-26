import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LogOut, Plus, Settings, ShieldCheck } from 'lucide-react';
import type { UserPreference, UserProfile } from '../types';

interface HeaderProps {
  user: UserProfile;
  userPreference: UserPreference | null;
  isPreviewMode: boolean;
  onOpenAddModal: () => void;
  onOpenAddUserModal: () => void;
  onOpenSupervisorSettings: () => void;
  onLogout: () => void;
}

export function Header({
  user,
  userPreference,
  isPreviewMode,
  onOpenAddModal,
  onOpenAddUserModal,
  onOpenSupervisorSettings,
  onLogout,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImgFailed(false);
  }, [user.photoURL]);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const initial = (user.name || user.email || 'N').charAt(0).toUpperCase();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
      <div className="w-full px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-4">
        {/* Brand Zone */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-600/20 shrink-0">
            <CheckCircle2 className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            NIWAS Tasklet
          </span>
        </div>

        {/* Actions Zone */}
        <div className="flex items-center gap-2 shrink-0">
          {user.isAdmin ? (
            <button
              type="button"
              onClick={onOpenAddUserModal}
              aria-label="Add User"
              title="Add User"
              className="px-3 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={2.4} />
              <span className="hidden sm:inline">Add User</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-sm shadow-emerald-600/20 transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" strokeWidth={2.4} />
              <span className="sm:hidden">Add</span>
              <span className="hidden sm:inline">Add Tasklet</span>
            </button>
          )}

          {/* Settings Gear Dropdown */}
          <div className="relative" ref={menuContainerRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="Account Settings"
              aria-expanded={menuOpen}
              className="p-2.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/70 rounded-xl transition flex items-center justify-center cursor-pointer"
            >
              <Settings className="w-5 h-5" />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] max-w-xs sm:w-80 bg-white rounded-2xl border border-slate-200 shadow-xl py-4 px-4 z-50">
                <div className="flex items-start gap-3 pb-3.5 border-b border-slate-100">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full bg-emerald-600 text-white font-bold text-sm flex items-center justify-center overflow-hidden">
                      {user.photoURL && !imgFailed ? (
                        <img
                          src={user.photoURL}
                          alt={user.name}
                          referrerPolicy="no-referrer"
                          onError={() => setImgFailed(true)}
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{user.email}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {user.isAdmin ? 'Admin' : 'Team Member'}
                      {isPreviewMode ? ' · Design Preview' : ''}
                    </p>
                  </div>
                </div>

                <div className="pt-2.5 flex flex-col gap-2">
                  {/* Non-Admin Supervisor Configuration Entry */}
                  {!user.isAdmin && (
                    <div className="pb-2.5 border-b border-slate-100 space-y-2">
                      <div className="flex items-center justify-between gap-2 px-1">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-500">My Supervisor</p>
                          <p className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                            {userPreference?.supervisorName || 'Not set'}
                          </p>
                          {userPreference?.supervisorEmail && (
                            <p className="text-[11px] text-slate-500 truncate">
                              {userPreference.supervisorEmail}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpen(false);
                            onOpenSupervisorSettings();
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{userPreference?.supervisorEmail ? 'Change' : 'Set Supervisor'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onLogout();
                      }}
                      className="px-3 py-2 rounded-xl text-rose-600 hover:bg-rose-50 text-xs font-medium transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 shrink-0" />
                      <span>Logout</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
