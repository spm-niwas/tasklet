import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, Info, ShieldCheck, X } from 'lucide-react';
import type { AuthorizedUser, TaskletVisibility, ToastType, UserPreference } from '../types';
import { capitalizeFirst } from '../utils/tasklet';

interface AddTaskletModalProps {
  isOpen: boolean;
  eligibleSupervisors: AuthorizedUser[];
  userPreference: UserPreference;
  isFirstTasklet: boolean;
  onClose: () => void;
  onRequestConfirmChangeSupervisor?: (currentSupervisorName: string, onConfirmed: () => void) => void;
  onNotify?: (message: string, type?: ToastType) => void;
  onCreateTasklet: (payload: {
    title: string;
    deadlineISO: string;
    visibility: TaskletVisibility;
    supervisorEmail: string | null;
    supervisorName: string | null;
  }) => Promise<void>;
}

function getTodayDateString(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function AddTaskletModal({
  isOpen,
  eligibleSupervisors,
  userPreference,
  isFirstTasklet,
  onClose,
  onRequestConfirmChangeSupervisor,
  onNotify,
  onCreateTasklet,
}: AddTaskletModalProps) {
  const [title, setTitle] = useState('');
  const [deadlineDate, setDeadlineDate] = useState(getTodayDateString);
  const [deadlineTime, setDeadlineTime] = useState('');
  const [selectedSupervisorEmail, setSelectedSupervisorEmail] = useState<string>('');
  const [isChangingSupervisor, setIsChangingSupervisor] = useState(false);
  const [visibility, setVisibility] = useState<TaskletVisibility>('supervisor');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const titleInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDeadlineDate(getTodayDateString());
      setDeadlineTime('');
      setErrorMsg(null);

      const hasValidSavedSupervisor = Boolean(
        userPreference.supervisorEmail &&
          eligibleSupervisors.some((u) => u.email === userPreference.supervisorEmail)
      );

      setSelectedSupervisorEmail(hasValidSavedSupervisor ? userPreference.supervisorEmail! : '');
      setIsChangingSupervisor(!hasValidSavedSupervisor);
      setVisibility(hasValidSavedSupervisor ? userPreference.defaultVisibility : 'private');

      window.setTimeout(() => titleInputRef.current?.focus(), 40);
    }
  }, [isOpen, userPreference, eligibleSupervisors]);

  if (!isOpen) return null;

  const minDate = getTodayDateString();
  const selectedSupervisor = eligibleSupervisors.find((u) => u.email === selectedSupervisorEmail) ?? null;

  const handleSupervisorSelect = (nextEmail: string) => {
    setSelectedSupervisorEmail(nextEmail);
    setErrorMsg(null);
    if (nextEmail) {
      setVisibility('supervisor');
    } else {
      setVisibility('private');
    }
  };

  const submitForm = async () => {
    setErrorMsg(null);
    const rawName = title.trim();

    const failValidation = (msg: string) => {
      setErrorMsg(msg);
      onNotify?.(msg, 'error');
    };

    if (!rawName) {
      failValidation('Please enter a Task Name.');
      titleInputRef.current?.focus();
      return;
    }

    if (!deadlineDate || !deadlineTime) {
      failValidation('Both Deadline Date and Deadline Time are mandatory.');
      return;
    }

    const [year, month, day] = deadlineDate.split('-').map(Number);
    const [hours, minutes] = deadlineTime.split(':').map(Number);
    const deadlineDateObj = new Date(year, month - 1, day, hours, minutes, 0, 0);

    if (Number.isNaN(deadlineDateObj.getTime())) {
      failValidation('Invalid date or time selected.');
      return;
    }

    if (deadlineDateObj.getTime() <= Date.now()) {
      failValidation('Deadline Date & Time cannot be in the past. Please choose a future time.');
      return;
    }

    if (visibility === 'supervisor' && !selectedSupervisor) {
      failValidation('Please select a Supervisor above, or choose "Viewable only to me".');
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateTasklet({
        title: capitalizeFirst(rawName),
        deadlineISO: deadlineDateObj.toISOString(),
        visibility,
        supervisorEmail: selectedSupervisor ? selectedSupervisor.email : null,
        supervisorName: selectedSupervisor ? selectedSupervisor.name : null,
      });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitForm();
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitForm();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-tasklet-modal-title"
    >
      <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden sm:my-auto max-h-[92dvh] overflow-y-auto pb-safe sm:pb-0">
        <div className="px-5 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 id="add-tasklet-modal-title" className="text-base font-bold text-slate-900">
            Create New Tasklet
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 sm:p-6 space-y-4" noValidate>
          <div>
            <label htmlFor="task-name-input" className="block text-xs font-semibold text-slate-600 mb-1.5">
              Task Name <span className="text-rose-500">*</span>
            </label>
            <textarea
              ref={titleInputRef}
              id="task-name-input"
              rows={2}
              value={title}
              maxLength={300}
              onChange={(e) => setTitle(capitalizeFirst(e.target.value))}
              onKeyDown={handleTitleKeyDown}
              placeholder="e.g., Finalize quarterly architecture review"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 outline-none transition resize-none leading-snug"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label htmlFor="deadline-date-input" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Deadline Date <span className="text-rose-500">*</span>
              </label>
              <input
                id="deadline-date-input"
                type="date"
                min={minDate}
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 outline-none transition"
                required
              />
            </div>

            <div>
              <label htmlFor="deadline-time-input" className="block text-xs font-semibold text-slate-600 mb-1.5">
                Deadline Time <span className="text-rose-500">*</span>
              </label>
              <input
                id="deadline-time-input"
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 outline-none transition"
                required
              />
            </div>
          </div>

          {/* Supervisor & Visibility Section */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>
                  {!userPreference.supervisorEmail && isFirstTasklet
                    ? 'Add Supervisor (First Tasklet)'
                    : 'Supervisor & Visibility'}
                </span>
              </span>
              {selectedSupervisor && !isChangingSupervisor && (
                <button
                  type="button"
                  onClick={() => {
                    if (onRequestConfirmChangeSupervisor) {
                      onRequestConfirmChangeSupervisor(selectedSupervisor.name, () => {
                        setIsChangingSupervisor(true);
                        onNotify?.('Select a new Supervisor from the dropdown.');
                      });
                    } else {
                      setIsChangingSupervisor(true);
                    }
                  }}
                  className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Change Supervisor
                </button>
              )}
            </div>

            {/* Supervisor Picker (shown on first tasklet / when no supervisor is set, or when user clicks Change) */}
            {(isChangingSupervisor || !selectedSupervisor) && (
              <div>
                <label htmlFor="modal-supervisor-select" className="block text-xs text-slate-500 mb-1">
                  Select a Supervisor from Admin-added users
                </label>
                <select
                  id="modal-supervisor-select"
                  value={selectedSupervisorEmail}
                  onChange={(e) => handleSupervisorSelect(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 text-base sm:text-sm text-slate-900 bg-white outline-none transition"
                >
                  <option value="">No supervisor selected</option>
                  {eligibleSupervisors.map((u) => (
                    <option key={u.email} value={u.email}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </select>
                {eligibleSupervisors.length === 0 && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    No other users have been added by the Admin yet.
                  </p>
                )}
              </div>
            )}

            {/* Visibility Radio Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 transition ${
                  !selectedSupervisor
                    ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                    : visibility === 'supervisor'
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900 cursor-pointer'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="tasklet-visibility"
                  value="supervisor"
                  disabled={!selectedSupervisor}
                  checked={visibility === 'supervisor' && Boolean(selectedSupervisor)}
                  onChange={() => setVisibility('supervisor')}
                  className="mt-0.5 accent-emerald-600"
                />
                <div className="min-w-0">
                  <span className="block">Viewable to supervisor</span>
                  {selectedSupervisor && (
                    <span className="block text-[11px] font-normal text-slate-500 truncate mt-0.5">
                      {selectedSupervisor.name}
                    </span>
                  )}
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border text-xs font-semibold flex items-start gap-2 cursor-pointer transition ${
                  visibility === 'private' || !selectedSupervisor
                    ? 'border-emerald-500 bg-emerald-50/70 text-emerald-900'
                    : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="tasklet-visibility"
                  value="private"
                  checked={visibility === 'private' || !selectedSupervisor}
                  onChange={() => setVisibility('private')}
                  className="mt-0.5 accent-emerald-600"
                />
                <div className="min-w-0">
                  <span className="block">Viewable only to me</span>
                  <span className="block text-[11px] font-normal text-slate-500 mt-0.5">Private</span>
                </div>
              </label>
            </div>

            {!selectedSupervisor && (
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600 text-[11px] flex items-start gap-2">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-500" />
                <span>You can add or change your Supervisor anytime from the Settings gear icon.</span>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-semibold shadow-sm shadow-emerald-600/20 transition cursor-pointer"
            >
              {isSubmitting ? 'Creating...' : 'Create Tasklet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
