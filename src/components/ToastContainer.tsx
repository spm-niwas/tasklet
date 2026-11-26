import { AlertCircle, Ban, Check } from 'lucide-react';
import type { ToastItem } from '../types';

interface ToastContainerProps {
  toasts: ToastItem[];
}

export function ToastContainer({ toasts }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        let style = 'bg-slate-900 text-white border-slate-800';
        let icon = <Check className="w-4 h-4 text-emerald-400 shrink-0" strokeWidth={2.4} />;

        if (toast.type === 'error') {
          style = 'bg-rose-600 text-white border-rose-500';
          icon = <AlertCircle className="w-4 h-4 text-rose-100 shrink-0" />;
        } else if (toast.type === 'closed') {
          style = 'bg-emerald-700 text-white border-emerald-600';
          icon = <Check className="w-4 h-4 text-emerald-200 shrink-0" strokeWidth={2.5} />;
        } else if (toast.type === 'abandoned') {
          style = 'bg-amber-700 text-white border-amber-600';
          icon = <Ban className="w-4 h-4 text-amber-200 shrink-0" />;
        }

        return (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto px-4 py-3 rounded-2xl shadow-lg border text-xs font-semibold flex items-center gap-2.5 ${style}`}
          >
            {icon}
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
