import { CheckCircle2 } from 'lucide-react';

interface LoginScreenProps {
  onGoogleSignIn: () => void;
  isSigningIn: boolean;
  errorMessage: string | null;
  canEnterPreview: boolean;
  onEnterPreview: () => void;
}

export function LoginScreen({
  onGoogleSignIn,
  isSigningIn,
  errorMessage,
  canEnterPreview,
  onEnterPreview,
}: LoginScreenProps) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm w-full max-w-sm p-8 text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-600/20">
            <CheckCircle2 className="w-6 h-6" strokeWidth={2.2} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">NIWAS Tasklet</h1>
          <p className="text-sm text-slate-500">Sign in with your authorized Google account to continue.</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={onGoogleSignIn}
            disabled={isSigningIn}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-slate-50 active:bg-slate-100 disabled:opacity-60 border border-slate-300 text-slate-800 text-sm font-semibold transition flex items-center justify-center gap-3 cursor-pointer focus-visible:outline-2 focus-visible:outline-emerald-600"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>{isSigningIn ? 'Signing in...' : 'Login with Google'}</span>
          </button>

          {canEnterPreview && (
            <button
              type="button"
              onClick={onEnterPreview}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200/70 text-slate-700 text-xs font-semibold transition cursor-pointer"
            >
              Open in Design Preview
            </button>
          )}
        </div>

        {errorMessage && (
          <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3.5 py-2.5 text-left leading-relaxed">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
