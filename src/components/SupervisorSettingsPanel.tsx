import { type FormEvent, useEffect, useState } from 'react';
import { ArrowLeft, Check, ShieldCheck, X } from 'lucide-react';
import type { AuthorizedUser, TaskletVisibility, UserPreference } from '../types';

interface SupervisorSettingsPanelProps {
  currentUserEmail: string;
  eligibleSupervisors: AuthorizedUser[];
  userPreference: UserPreference;
  onSavePreference: (nextPref: {
    supervisorEmail: string | null;
    supervisorName: string | null;
    defaultVisibility: TaskletVisibility;
  }) => Promise<void>;
  onClose: () => void;
  onBackToList: () => void;
}

export function SupervisorSettingsPanel({
  eligibleSupervisors,
  userPreference,
  onSavePreference,
  onClose,
  onBackToList,
}: SupervisorSettingsPanelProps) {
  const [selectedEmail, setSelectedEmail] = useState<string>(userPreference.supervisorEmail ?? '');
  const [defaultVisibility, setDefaultVisibility] = useState<TaskletVisibility>(
    userPreference.supervisorEmail ? userPreference.defaultVisibility : 'private'
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedEmail(userPreference.supervisorEmail ?? '');
    setDefaultVisibility(userPreference.supervisorEmail ? userPreference.defaultVisibility : 'private');
  }, [userPreference]);

  const handleSupervisorChange = (nextEmail: string) => {
    setSelectedEmail(nextEmail);
    if (nextEmail && !userPreference.supervisorEmail) {
      setDefaultVisibility('supervisor');
    } else if (!nextEmail) {
      setDefaultVisibility('private');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const matched = eligibleSupervisors.find((u) => u.email === selectedEmail);
    const supervisorEmail = matched ? matched.email : null;
    const supervisorName = matched ? matched.name : null;

    setIsSaving(true);
    try {
      await onSavePreference({
        supervisorEmail,
        supervisorName,
        defaultVisibility: supervisorEmail ? defaultVisibility : 'private',
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col space-y-5 sm:space-y-6">
      {/* Mobile Back Bar */}
      <div className="lg:hidden pb-2 border-b border-slate-100">
        <button
          type="button"
          onClick={onBackToList}
          className="inline-flex items-center gap-1.5 px-3 py-2 -ml-1 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200/70 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Back to Tasklets</span>
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">Supervisor Settings</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose one team member as your Supervisor and set your default visibility preference.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="hidden lg:flex px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-600 transition items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          <span>Back to Tasklet</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
        <div>
          <label htmlFor="settings-supervisor-select" className="block text-xs font-semibold text-slate-600 mb-1.5">
            Assigned Supervisor (Optional)
          </label>
          <select
            id="settings-supervisor-select"
            value={selectedEmail}
            onChange={(e) => handleSupervisorChange(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 bg-white outline-none transition"
          >
            <option value="">No supervisor selected (Private only)</option>
            {eligibleSupervisors.map((u) => (
              <option key={u.email} value={u.email}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
          {eligibleSupervisors.length === 0 ? (
            <p className="text-xs text-amber-700 mt-1.5">
              No other users have been added by the Admin yet.
            </p>
          ) : (
            <p className="text-xs text-slate-400 mt-1.5">
              Only team members added by the Admin are available. Changing your supervisor applies to future tasklets tagged to your supervisor.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-600">Default Visibility for New Tasklets</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <label
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 transition ${
                !selectedEmail
                  ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                  : defaultVisibility === 'supervisor'
                  ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 cursor-pointer'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer'
              }`}
            >
              <input
                type="radio"
                name="default-visibility"
                value="supervisor"
                disabled={!selectedEmail}
                checked={defaultVisibility === 'supervisor' && Boolean(selectedEmail)}
                onChange={() => setDefaultVisibility('supervisor')}
                className="accent-emerald-600"
              />
              <span>Viewable to supervisor</span>
            </label>

            <label
              className={`p-3 rounded-xl border text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition ${
                defaultVisibility === 'private' || !selectedEmail
                  ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900'
                  : 'border-slate-200 hover:bg-slate-50 text-slate-700'
              }`}
            >
              <input
                type="radio"
                name="default-visibility"
                value="private"
                checked={defaultVisibility === 'private' || !selectedEmail}
                onChange={() => setDefaultVisibility('private')}
                className="accent-emerald-600"
              />
              <span>Viewable only to me</span>
            </label>
          </div>
        </div>

        <div className="pt-2 flex items-center gap-2.5">
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
          >
            <Check className="w-4 h-4" strokeWidth={2.4} />
            <span>{isSaving ? 'Saving...' : 'Save Supervisor Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
