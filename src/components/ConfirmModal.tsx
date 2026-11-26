import { AlertTriangle, Check } from 'lucide-react';
import type { ConfirmDialogConfig } from '../types';

interface ConfirmModalProps {
  config: ConfirmDialogConfig | null;
  onCancel: () => void;
}

export function ConfirmModal({ config, onCancel }: ConfirmModalProps) {
  if (!config) return null;

  const isDanger = config.variant === 'danger';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDanger ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
            }`}
          >
            {isDanger ? <AlertTriangle className="w-5 h-5" /> : <Check className="w-5 h-5" strokeWidth={2.4} />}
          </div>
          <div>
            <h3 id="confirm-dialog-title" className="text-base font-bold text-slate-900">
              {config.title}
            </h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed">{config.message}</p>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              void config.onConfirm();
              onCancel();
            }}
            className={`px-4 py-2 rounded-xl text-white text-sm font-semibold shadow-sm transition cursor-pointer ${
              isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
