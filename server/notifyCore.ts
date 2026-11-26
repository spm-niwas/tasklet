import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import fs from 'fs';
import path from 'path';
import {
  buildNotificationEmails,
  type EmailMessageSpec,
  type EmailTriggerEvent,
} from './emailTemplates.ts';

const HARDCODED_ADMIN_EMAIL = 'director@spmniwas.in';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ADMIN_EVENTS = new Set<EmailTriggerEvent>([
  'user_added',
  'user_removed',
  'user_data_cleared',
]);

const MEMBER_EVENTS = new Set<EmailTriggerEvent>([
  'supervisor_assigned',
  'supervisor_changed',
  'supervisor_removed',
  'tasklet_created_supervisor',
  'tasklet_closed',
  'tasklet_abandoned',
]);

interface FirebaseAppletConfig {
  projectId?: string;
}

function loadFirebaseProjectId(): string {
  const candidates = [
    path.resolve(process.cwd(), 'firebase-applet-config.json'),
  ];
  try {
    candidates.unshift(
      path.resolve(path.dirname(new URL(import.meta.url).pathname), '../firebase-applet-config.json')
    );
  } catch {
    // Ignore URL resolution issues in bundled environments
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as FirebaseAppletConfig;
        if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
          return parsed.projectId;
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return (process.env.FIREBASE_PROJECT_ID || '').trim();
}

function ensureFirebaseAdminInitialized(): boolean {
  if (getApps().length > 0) {
    getApp();
    return true;
  }
  const projectId = loadFirebaseProjectId();
  if (!projectId) return false;
  initializeApp({ projectId });
  return true;
}

function cleanOptionalString(val: unknown, maxLen: number): string | undefined {
  if (typeof val !== 'string') return undefined;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function cleanOptionalEmail(val: unknown): string | undefined {
  const str = cleanOptionalString(val, 160)?.toLowerCase();
  if (!str || !EMAIL_REGEX.test(str)) return undefined;
  return str;
}

function parseSafeAppsScriptUrl(rawUrl: string): { url: string | null; reason?: string } {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return { url: null, reason: 'APPS_SCRIPT_URL is not configured on the server.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return { url: null, reason: 'APPS_SCRIPT_URL must start with https://.' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== 'script.google.com' && host !== 'script.googleusercontent.com') {
      return {
        url: null,
        reason: 'APPS_SCRIPT_URL must point to script.google.com.',
      };
    }
    if (host === 'script.google.com' && !parsed.pathname.endsWith('/exec')) {
      return {
        url: null,
        reason: 'APPS_SCRIPT_URL must be the deployed Web App URL ending in /exec.',
      };
    }
    return { url: parsed.toString() };
  } catch {
    return { url: null, reason: 'APPS_SCRIPT_URL is not a valid URL.' };
  }
}

function getEmailTransportConfig(): {
  configured: boolean;
  reason?: string;
  appsScriptUrl?: string;
  appsScriptSecret?: string;
  senderName: string;
} {
  const urlCheck = parseSafeAppsScriptUrl(process.env.APPS_SCRIPT_URL || '');
  const appsScriptSecret = (process.env.APPS_SCRIPT_SECRET || '').trim();

  if (!urlCheck.url) {
    return {
      configured: false,
      reason: urlCheck.reason,
      senderName: 'NIWAS Tasklet',
    };
  }

  return {
    configured: true,
    appsScriptUrl: urlCheck.url,
    appsScriptSecret,
    senderName: 'NIWAS Tasklet',
  };
}

function resolveSafeAppUrl(): string {
  const configured = (process.env.APP_URL || '').trim();
  if (configured && configured !== 'MY_APP_URL') {
    return configured;
  }
  const prodHost = (process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (prodHost) {
    return `https://${prodHost}`;
  }
  const previewHost = (process.env.VERCEL_URL || '').trim();
  if (previewHost) {
    return `https://${previewHost}`;
  }
  return '';
}

async function deliverEmails(messages: EmailMessageSpec[]): Promise<{
  configured: boolean;
  deliveredCount: number;
  failedCount: number;
  lastError?: string;
}> {
  if (messages.length === 0) {
    return { configured: true, deliveredCount: 0, failedCount: 0 };
  }

  const cfg = getEmailTransportConfig();
  if (!cfg.configured || !cfg.appsScriptUrl) {
    return {
      configured: false,
      deliveredCount: 0,
      failedCount: messages.length,
      lastError: cfg.reason || 'Email delivery is not configured on the server.',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let lastError: string | undefined;

  for (const msg of messages) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(cfg.appsScriptUrl, {
        method: 'POST',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: cfg.appsScriptSecret || '',
          to: msg.to,
          subject: msg.subject,
          htmlBody: msg.html,
          textBody: msg.text,
          senderName: cfg.senderName,
        }),
      });
      const bodyText = await resp.text();
      if (!resp.ok) {
        throw new Error(`Apps Script HTTP ${resp.status}`);
      }
      let parsedJson: { ok?: boolean; error?: string } | null = null;
      try {
        parsedJson = JSON.parse(bodyText) as { ok?: boolean; error?: string };
      } catch {
        parsedJson = null;
      }
      if (parsedJson && parsedJson.ok === false) {
        throw new Error(parsedJson.error || 'Apps Script rejected email request.');
      }
      if (!parsedJson && bodyText.trim().startsWith('<')) {
        throw new Error(
          'Apps Script returned a login/HTML page instead of JSON. In Apps Script Deploy settings, set "Who has access" to "Anyone" and use the /exec URL.'
        );
      }
      if (!parsedJson) {
        throw new Error('Apps Script returned an unexpected response.');
      }
      deliveredCount++;
    } catch (err) {
      failedCount++;
      lastError = err instanceof Error ? err.message : 'Failed to deliver email via Apps Script.';
      console.error(`[email] Failed to send Apps Script email to ${msg.to}:`, err);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return { configured: true, deliveredCount, failedCount, lastError };
}

export function getEmailHealth(): { ok: true; emailConfigured: boolean; reason?: string } {
  const cfg = getEmailTransportConfig();
  return cfg.configured
    ? { ok: true, emailConfigured: true }
    : { ok: true, emailConfigured: false, reason: cfg.reason };
}

export interface NotifyHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleNotifyRequest(
  authorizationHeader: string | undefined,
  rawBody: unknown
): Promise<NotifyHandlerResult> {
  const authHeader = authorizationHeader || '';
  if (!authHeader.startsWith('Bearer ')) {
    return { status: 401, body: { ok: false, error: 'Missing Bearer authentication token.' } };
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { status: 401, body: { ok: false, error: 'Empty authentication token.' } };
  }

  if (!ensureFirebaseAdminInitialized()) {
    return {
      status: 500,
      body: { ok: false, error: 'Firebase project configuration is missing on the server.' },
    };
  }

  let authUser: { uid: string; email: string; name: string };
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = typeof decoded.email === 'string' ? decoded.email.trim().toLowerCase() : '';
    if (!email || decoded.email_verified !== true) {
      return { status: 403, body: { ok: false, error: 'Verified email required.' } };
    }
    authUser = {
      uid: decoded.uid,
      email,
      name: typeof decoded.name === 'string' && decoded.name.trim() ? decoded.name.trim() : email,
    };
  } catch {
    return {
      status: 401,
      body: { ok: false, error: 'Invalid or expired Firebase authentication token.' },
    };
  }

  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const rawEvent = typeof body.event === 'string' ? (body.event.trim() as EmailTriggerEvent) : null;

  if (!rawEvent || (!ADMIN_EVENTS.has(rawEvent) && !MEMBER_EVENTS.has(rawEvent))) {
    return { status: 400, body: { ok: false, error: 'Unsupported notification event.' } };
  }

  const isAdmin = authUser.email === HARDCODED_ADMIN_EMAIL;
  if (ADMIN_EVENTS.has(rawEvent) && !isAdmin) {
    return {
      status: 403,
      body: { ok: false, error: 'Only Admin can trigger user management notifications.' },
    };
  }
  if (MEMBER_EVENTS.has(rawEvent) && isAdmin) {
    return {
      status: 403,
      body: { ok: false, error: 'Admin cannot trigger tasklet or supervisor notifications.' },
    };
  }

  const seqNum =
    typeof body.taskletSeq === 'number' && Number.isInteger(body.taskletSeq) && body.taskletSeq >= 1
      ? body.taskletSeq
      : undefined;

  const messages = buildNotificationEmails({
    event: rawEvent,
    actorName: cleanOptionalString(body.actorName, 100) || authUser.name,
    actorEmail: authUser.email,
    appUrl: resolveSafeAppUrl(),
    targetName: cleanOptionalString(body.targetName, 100),
    targetEmail: cleanOptionalEmail(body.targetEmail),
    scopeDescription: cleanOptionalString(body.scopeDescription, 200),
    supervisorName: cleanOptionalString(body.supervisorName, 100),
    supervisorEmail: cleanOptionalEmail(body.supervisorEmail),
    previousSupervisorName: cleanOptionalString(body.previousSupervisorName, 100),
    previousSupervisorEmail: cleanOptionalEmail(body.previousSupervisorEmail),
    taskletSeq: seqNum,
    taskletTitle: cleanOptionalString(body.taskletTitle, 300),
    taskletDeadlineISO: cleanOptionalString(body.taskletDeadlineISO, 40),
    taskletDescription: cleanOptionalString(body.taskletDescription, 1500),
    resolvedAtISO: cleanOptionalString(body.resolvedAtISO, 40),
    recipientEmail: cleanOptionalEmail(body.recipientEmail),
    recipientName: cleanOptionalString(body.recipientName, 100),
  });

  if (messages.length === 0) {
    return {
      status: 200,
      body: { ok: true, configured: true, delivered: false, deliveredCount: 0, failedCount: 0 },
    };
  }

  const result = await deliverEmails(messages);
  return {
    status: 200,
    body: {
      ok: true,
      configured: result.configured,
      delivered: result.deliveredCount > 0,
      deliveredCount: result.deliveredCount,
      failedCount: result.failedCount,
      error: result.lastError,
    },
  };
}
