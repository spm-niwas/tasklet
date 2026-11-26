import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Ban, Calendar, Check, MousePointerClick } from 'lucide-react';
import type { FilterTab, Tasklet, ToastType } from '../types';
import {
  countWords,
  enforceWordLimit,
  formatDateDDMMYY,
  formatDeadline,
  getEffectiveStatus,
  MAX_WORDS,
  MIN_WORDS,
} from '../utils/tasklet';

interface TaskletDetailPaneProps {
  tasklet: Tasklet | null;
  currentUserEmail: string;
  activeFilter: FilterTab;
  nowMs: number;
  onBackToList: () => void;
  onSaveDescription: (tasklet: Tasklet, description: string, silent?: boolean) => Promise<void>;
  onResolveTasklet: (tasklet: Tasklet, targetStatus: 'Closed' | 'Abandoned', description: string) => void;
  onNotify?: (message: string, type?: ToastType) => void;
}

export function TaskletDetailPane({
  tasklet,
  currentUserEmail,
  activeFilter,
  nowMs,
  onBackToList,
  onSaveDescription,
  onResolveTasklet,
  onNotify,
}: TaskletDetailPaneProps) {
  const [draftDescription, setDraftDescription] = useState(tasklet?.description ?? '');
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved');
  const [showMinWarning, setShowMinWarning] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const isEditingRef = useRef(false);
  const lastTaskletIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tasklet) {
      lastTaskletIdRef.current = null;
      setDraftDescription('');
      setShowMinWarning(false);
      setSaveState('saved');
      return;
    }

    const switchedTasklet = lastTaskletIdRef.current !== tasklet.id;
    if (switchedTasklet) {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      lastTaskletIdRef.current = tasklet.id;
      setDraftDescription(tasklet.description ?? '');
      setShowMinWarning(false);
      setSaveState('saved');
      isEditingRef.current = false;
    } else if (!isEditingRef.current && tasklet.description !== draftDescription) {
      setDraftDescription(tasklet.description ?? '');
    }
  }, [tasklet, draftDescription]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  if (!tasklet) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 my-auto">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
          <MousePointerClick className="w-7 h-7" strokeWidth={1.8} />
        </div>
        <h3 className="text-base font-bold text-slate-900">Select a Tasklet</h3>
        <p className="text-xs text-slate-500 mt-1.5 max-w-sm leading-relaxed">
          Choose any tasklet from the list to inspect its deadline, record notes, or mark it as Closed or Abandoned.
        </p>
      </div>
    );
  }

  const eff = getEffectiveStatus(tasklet, nowMs);
  const isEditable = eff === 'Active' || eff === 'Overdue';
  const overdue = eff === 'Overdue';
  const wordCount = countWords(draftDescription);
  const hasMinWords = wordCount >= MIN_WORDS;
  const isSupervisorView =
    Boolean(tasklet.createdByEmail) && tasklet.createdByEmail.toLowerCase() !== currentUserEmail.toLowerCase();
  const visibilityContext = isSupervisorView
    ? `Assigned by ${tasklet.createdBy || 'Team Member'} · You are Supervisor`
    : tasklet.visibility === 'supervisor' && tasklet.supervisorName
    ? `Supervisor: ${tasklet.supervisorName}`
    : 'Viewable only to me';

  const commitNow = (text: string, silent = false) => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    if (text !== tasklet.description) {
      void onSaveDescription(tasklet, text, silent);
    }
    setSaveState('saved');
  };

  const handleDescriptionChange = (rawVal: string) => {
    const capped = enforceWordLimit(rawVal, MAX_WORDS);
    setDraftDescription(capped);

    if (countWords(capped) >= MIN_WORDS && showMinWarning) {
      setShowMinWarning(false);
    }

    setSaveState('saving');
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void onSaveDescription(tasklet, capped, false);
      setSaveState('saved');
      debounceTimerRef.current = null;
    }, 450);
  };

  const handleAttemptResolve = (targetStatus: 'Closed' | 'Abandoned') => {
    const capped = enforceWordLimit(draftDescription, MAX_WORDS);
    commitNow(capped, true);

    if (countWords(capped) < MIN_WORDS) {
      setShowMinWarning(true);
      onNotify?.(`Enter at least ${MIN_WORDS} words in Description to enable Abandoned / Close.`, 'error');
      textareaRef.current?.focus();
      return;
    }

    onResolveTasklet(tasklet, targetStatus, capped);
  };

  if (isEditable) {
    return (
      <div className="flex-1 flex flex-col space-y-4 sm:space-y-5">
        {/* Mobile Back Navigation */}
        <div className="lg:hidden pb-2 border-b border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 px-3 py-2 -ml-1 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200/70 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to List</span>
          </button>
          <span className="text-xs font-medium text-slate-400">{activeFilter}</span>
        </div>

        <div className="space-y-4 sm:space-y-5">
          {/* Meta Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 sm:pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-mono tabular-nums font-bold">
                #{tasklet.seq}
              </span>
              <span
                className={`px-2.5 py-1 rounded-xl text-xs font-bold ${
                  overdue ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {eff}
              </span>
            </div>

            <div
              className={`text-xs font-mono tabular-nums font-semibold flex items-center gap-1.5 ${
                overdue ? 'text-rose-600' : 'text-slate-600'
              }`}
            >
              <Calendar className="w-4 h-4 shrink-0" />
              <span>Due: {formatDeadline(tasklet.deadlineISO)}</span>
            </div>
          </div>

          {/* Title */}
          <div className="pb-1 sm:pb-2">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{tasklet.title}</h2>
          </div>

          {/* Description Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="detail-description-input" className="text-xs font-semibold text-slate-500">
                Description
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className={saveState === 'saving' ? 'text-slate-400 font-medium' : 'text-emerald-600 font-medium'}>
                  {saveState === 'saving' ? 'Saving...' : 'Saved'}
                </span>
                <span className="text-slate-300" aria-hidden="true">
                  ·
                </span>
                <span
                  className={`font-mono tabular-nums font-semibold ${
                    wordCount >= MAX_WORDS ? 'text-amber-600' : 'text-slate-600'
                  }`}
                >
                  {wordCount} / {MAX_WORDS} words
                </span>
              </div>
            </div>

            <textarea
              ref={textareaRef}
              id="detail-description-input"
              rows={5}
              value={draftDescription}
              onFocus={() => {
                isEditingRef.current = true;
              }}
              onBlur={() => {
                isEditingRef.current = false;
                const capped = enforceWordLimit(draftDescription, MAX_WORDS);
                if (capped !== draftDescription) setDraftDescription(capped);
                commitNow(capped);
              }}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Summarize progress, outcome, or reason before closing or abandoning (min 3 words, max 50 words)..."
              className={`w-full p-3.5 sm:p-4 rounded-2xl border ${
                showMinWarning && !hasMinWords
                  ? 'border-rose-400 ring-2 ring-rose-500/20'
                  : 'border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
              } text-base sm:text-sm text-slate-800 placeholder-slate-400 leading-relaxed outline-none transition resize-none`}
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-slate-500">
              <p>
                {isSupervisorView ? (
                  <>
                    Assigned by <span className="font-semibold text-slate-700">{tasklet.createdBy || 'Team Member'}</span>
                  </>
                ) : (
                  <>
                    Created by <span className="font-semibold text-slate-700">{tasklet.createdBy || 'Team Member'}</span>
                  </>
                )}{' '}
                · <span className="font-mono tabular-nums text-slate-600">{formatDeadline(tasklet.createdAtISO)}</span>
              </p>
              <span className="font-medium text-slate-600">{visibilityContext}</span>
            </div>
          </div>

          {/* Minimum 3-word inline warning */}
          {showMinWarning && !hasMinWords && (
            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>Enter at least {MIN_WORDS} words in Description to enable Abandoned / Close.</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2.5 sm:gap-3">
            <button
              type="button"
              onClick={() => handleAttemptResolve('Abandoned')}
              className="w-full sm:w-auto justify-center px-4 py-3 sm:py-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-sm font-semibold transition flex items-center gap-1.5 cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span>Abandoned</span>
            </button>
            <button
              type="button"
              onClick={() => handleAttemptResolve('Closed')}
              className="w-full sm:w-auto justify-center px-5 py-3 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-sm shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" strokeWidth={2.4} />
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Read-only view for Closed or Abandoned tasklets
  const isClosed = tasklet.status === 'Closed';
  const resolvedDate = formatDateDDMMYY(tasklet.resolvedAtISO || tasklet.deadlineISO);

  return (
    <div className="flex-1 flex flex-col justify-between space-y-5 sm:space-y-6">
      <div className="space-y-4 sm:space-y-5">
        {/* Mobile Back Navigation */}
        <div className="lg:hidden pb-2 border-b border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 px-3 py-2 -ml-1 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 active:bg-slate-200/70 transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to List</span>
          </button>
          <span className="text-xs font-medium text-slate-400">{activeFilter}</span>
        </div>

        {/* Top Meta Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 sm:pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl bg-slate-900 text-white text-xs font-mono tabular-nums font-bold">
              #{tasklet.seq}
            </span>
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold ${
                isClosed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {isClosed ? `Closed on ${resolvedDate}` : `Abandoned on ${resolvedDate}`}
            </span>
          </div>
          <div className="text-xs font-mono tabular-nums font-medium text-slate-500 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 shrink-0" />
            <span>Original Deadline: {formatDeadline(tasklet.deadlineISO)}</span>
          </div>
        </div>

        {/* Title */}
        <div className="pb-1 sm:pb-2">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">{tasklet.title}</h2>
        </div>

        {/* Read-Only Description */}
        <div className="space-y-2">
          <span className="block text-xs font-semibold text-slate-500">
            Final Recorded Description (Read-Only)
          </span>
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {(tasklet.description || 'No description provided.').trim()}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-slate-500">
            <p>
              {isSupervisorView ? (
                <>
                  Assigned by <span className="font-semibold text-slate-700">{tasklet.createdBy || 'Team Member'}</span>
                </>
              ) : (
                <>
                  Created by <span className="font-semibold text-slate-700">{tasklet.createdBy || 'Team Member'}</span>
                </>
              )}{' '}
              · <span className="font-mono tabular-nums text-slate-600">{formatDeadline(tasklet.createdAtISO)}</span>
            </p>
            <span className="font-medium text-slate-600">{visibilityContext}</span>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
        <span>This tasklet is archived and locked from further edits.</span>
        <span className="font-mono tabular-nums font-semibold text-slate-500">
          {countWords(tasklet.description)} words
        </span>
      </div>
    </div>
  );
}
