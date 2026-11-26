import type { AuthorizedUser, EffectiveStatus, Tasklet, UserPreference } from '../types';

export const HARDCODED_ADMIN_EMAIL = 'director@spmniwas.in';
export const ITEMS_PER_PAGE = 25;
export const MIN_WORDS = 3;
export const MAX_WORDS = 50;

const PREVIEW_TASKLETS_KEY = 'niwas_tasklet_preview_data_v2';
const PREVIEW_USERS_KEY = 'niwas_tasklet_preview_users_v2';
const PREVIEW_PREFS_KEY = 'niwas_tasklet_preview_prefs_v2';
const PREVIEW_SEQ_KEY = 'niwas_tasklet_preview_seq_v2';

export function isEmbeddedPreview(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function createSeedTasklets(): Tasklet[] {
  const now = new Date();
  const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const yesterday = new Date(now.getTime() - 20 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  return [
    {
      id: 'tsk-1',
      seq: 1,
      title: 'Finalize Q4 cloud infrastructure migration plan',
      deadlineISO: inTwoHours.toISOString(),
      status: 'Active',
      description:
        'Review VPC peering rules, confirm database failover SLAs, and sign off on production cutover window with DevOps.',
      resolvedAtISO: null,
      createdBy: 'Arjun Sharma',
      createdByEmail: 'arjun@spmniwas.in',
      createdByUid: 'preview-arjun',
      createdAtISO: twoDaysAgo.toISOString(),
      visibility: 'supervisor',
      supervisorEmail: 'priya@spmniwas.in',
      supervisorName: 'Priya Verma',
    },
    {
      id: 'tsk-2',
      seq: 2,
      title: 'Personal annual tax document compilation',
      deadlineISO: tomorrow.toISOString(),
      status: 'Active',
      description: 'Collect investment proofs and rent receipts before submission.',
      resolvedAtISO: null,
      createdBy: 'Arjun Sharma',
      createdByEmail: 'arjun@spmniwas.in',
      createdByUid: 'preview-arjun',
      createdAtISO: now.toISOString(),
      visibility: 'private',
      supervisorEmail: null,
      supervisorName: null,
    },
    {
      id: 'tsk-3',
      seq: 3,
      title: 'Submit vendor security compliance audit',
      deadlineISO: yesterday.toISOString(),
      status: 'Active',
      description: '',
      resolvedAtISO: null,
      createdBy: 'Priya Verma',
      createdByEmail: 'priya@spmniwas.in',
      createdByUid: 'preview-priya',
      createdAtISO: twoDaysAgo.toISOString(),
      visibility: 'private',
      supervisorEmail: null,
      supervisorName: null,
    },
    {
      id: 'tsk-4',
      seq: 4,
      title: 'Audit legacy API deprecation endpoints',
      deadlineISO: twoDaysAgo.toISOString(),
      status: 'Closed',
      description: 'Verified zero external traffic on v1 endpoints and decommissioned legacy gateway routes.',
      resolvedAtISO: yesterday.toISOString(),
      createdBy: 'Arjun Sharma',
      createdByEmail: 'arjun@spmniwas.in',
      createdByUid: 'preview-arjun',
      createdAtISO: twoDaysAgo.toISOString(),
      visibility: 'supervisor',
      supervisorEmail: 'priya@spmniwas.in',
      supervisorName: 'Priya Verma',
    },
  ];
}

export function loadPreviewTasklets(): Tasklet[] {
  try {
    const raw = localStorage.getItem(PREVIEW_TASKLETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Tasklet[];
    }
  } catch {
    // Fallback to seed tasklets
  }
  const seeded = createSeedTasklets();
  savePreviewTasklets(seeded);
  try {
    localStorage.setItem(PREVIEW_SEQ_KEY, String(seeded.length));
  } catch {
    // Ignore
  }
  return seeded;
}

export function savePreviewTasklets(tasklets: Tasklet[]): void {
  try {
    localStorage.setItem(PREVIEW_TASKLETS_KEY, JSON.stringify(tasklets));
  } catch {
    // Ignore storage quota errors in preview
  }
}

export function getNextPreviewSeq(existingTasklets: Tasklet[]): number {
  const maxExisting = existingTasklets.reduce((max, t) => Math.max(max, t.seq || 0), 0);
  let stored = 0;
  try {
    stored = Number(localStorage.getItem(PREVIEW_SEQ_KEY) || '0') || 0;
  } catch {
    stored = 0;
  }
  const next = Math.max(maxExisting, stored) + 1;
  try {
    localStorage.setItem(PREVIEW_SEQ_KEY, String(next));
  } catch {
    // Ignore
  }
  return next;
}

export function loadPreviewAuthorizedUsers(): AuthorizedUser[] {
  try {
    const raw = localStorage.getItem(PREVIEW_USERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as AuthorizedUser[];
      }
    }
  } catch {
    // Fallback to defaults
  }
  const now = Date.now();
  const initial: AuthorizedUser[] = [
    { email: HARDCODED_ADMIN_EMAIL, name: 'Director', createdAtISO: new Date(now - 7 * 86400000).toISOString() },
    { email: 'arjun@spmniwas.in', name: 'Arjun Sharma', createdAtISO: new Date(now - 3 * 86400000).toISOString() },
    { email: 'priya@spmniwas.in', name: 'Priya Verma', createdAtISO: new Date(now - 1 * 86400000).toISOString() },
  ];
  savePreviewAuthorizedUsers(initial);
  return initial;
}

export function savePreviewAuthorizedUsers(users: AuthorizedUser[]): void {
  try {
    localStorage.setItem(PREVIEW_USERS_KEY, JSON.stringify(users));
  } catch {
    // Ignore storage quota errors in preview
  }
}

export function loadPreviewPreference(email: string): UserPreference {
  const normalized = email.trim().toLowerCase();
  try {
    const raw = localStorage.getItem(PREVIEW_PREFS_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, UserPreference>;
      if (map && map[normalized]) {
        return map[normalized];
      }
    }
  } catch {
    // Fallback
  }
  return {
    email: normalized,
    supervisorEmail: normalized === 'arjun@spmniwas.in' ? 'priya@spmniwas.in' : null,
    supervisorName: normalized === 'arjun@spmniwas.in' ? 'Priya Verma' : null,
    defaultVisibility: 'supervisor',
    defaultListScope: 'all',
  };
}

export function savePreviewPreference(pref: UserPreference): void {
  try {
    const raw = localStorage.getItem(PREVIEW_PREFS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, UserPreference>) : {};
    map[pref.email.trim().toLowerCase()] = pref;
    localStorage.setItem(PREVIEW_PREFS_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
}

export function isAdminEmail(email?: string | null): boolean {
  return (email ?? '').trim().toLowerCase() === HARDCODED_ADMIN_EMAIL;
}

export function capitalizeFirst(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function deriveNameFromEmail(
  email?: string | null,
  authorizedUsers: Array<{ email: string; name: string }> = []
): string {
  const normalized = (email ?? '').trim().toLowerCase();
  if (isAdminEmail(normalized)) return 'Director';
  const existing = authorizedUsers.find((u) => u.email === normalized);
  if (existing?.name) return existing.name;
  const localPart = normalized.split('@')[0] || 'Member';
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function isOverdue(tasklet: Pick<Tasklet, 'status' | 'deadlineISO'>, nowMs = Date.now()): boolean {
  if (tasklet.status !== 'Active') return false;
  const deadlineMs = new Date(tasklet.deadlineISO).getTime();
  return !Number.isNaN(deadlineMs) && deadlineMs < nowMs;
}

export function getEffectiveStatus(tasklet: Pick<Tasklet, 'status' | 'deadlineISO'>, nowMs = Date.now()): EffectiveStatus {
  if (tasklet.status === 'Closed') return 'Closed';
  if (tasklet.status === 'Abandoned') return 'Abandoned';
  return isOverdue(tasklet, nowMs) ? 'Overdue' : 'Active';
}

export function formatDateDDMMYY(isoOrDateString?: string | null): string {
  if (!isoOrDateString) return '--';
  const d = new Date(isoOrDateString);
  if (Number.isNaN(d.getTime())) return '--';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

export function formatTimeHHMM(isoString?: string | null): string {
  if (!isoString) return '--:--';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '--:--';
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export function formatDeadline(isoString?: string | null): string {
  return `${formatDateDDMMYY(isoString)} at ${formatTimeHHMM(isoString)}`;
}

export function countWords(text?: string | null): number {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function enforceWordLimit(text: string, maxWords: number): string {
  const trimmedStart = text.replace(/^\s+/, '');
  if (!trimmedStart) return '';
  const words = trimmedStart.trim().split(/\s+/);
  if (words.length <= maxWords) return text;
  const matches = [...text.matchAll(/\S+/g)];
  if (matches.length > maxWords && matches[maxWords].index !== undefined) {
    return text.slice(0, matches[maxWords].index).trimEnd();
  }
  return words.slice(0, maxWords).join(' ');
}
