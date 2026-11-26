import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type EmailTriggerEvent =
  | 'user_added'
  | 'user_removed'
  | 'user_data_cleared'
  | 'supervisor_assigned'
  | 'supervisor_changed'
  | 'supervisor_removed'
  | 'tasklet_created_supervisor'
  | 'tasklet_closed'
  | 'tasklet_abandoned';

interface EmailMessageSpec {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface EmailPayloadInput {
  event: EmailTriggerEvent;
  actorName: string;
  actorEmail: string;
  appUrl: string;
  targetName?: string;
  targetEmail?: string;
  scopeDescription?: string;
  supervisorName?: string;
  supervisorEmail?: string;
  previousSupervisorName?: string;
  previousSupervisorEmail?: string;
  taskletSeq?: number;
  taskletTitle?: string;
  taskletDeadlineISO?: string;
  taskletDescription?: string;
  resolvedAtISO?: string;
  recipientEmail?: string;
  recipientName?: string;
}

interface VercelApiRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (payload: unknown) => void;
}

export interface NotifyHandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const HARDCODED_ADMIN_EMAIL = 'director@spmniwas.in';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIREBASE_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

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

let cachedCerts: Record<string, string> = {};
let certsExpiresAtMs = 0;

function loadFirebaseProjectId(): string {
  const envId = (process.env.FIREBASE_PROJECT_ID || '').trim();
  if (envId) return envId;

  const candidates = [path.resolve(process.cwd(), 'firebase-applet-config.json')];
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    candidates.unshift(path.resolve(here, '../firebase-applet-config.json'));
  } catch {
    // Ignore when bundled into CommonJS or without import.meta.url
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { projectId?: string };
        if (parsed.projectId && parsed.projectId !== 'remixed-project-id') {
          return parsed.projectId;
        }
      }
    } catch {
      // Try next candidate
    }
  }

  return '';
}

function base64UrlToBuffer(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

async function fetchFirebasePublicCerts(forceRefresh = false): Promise<Record<string, string>> {
  const now = Date.now();
  if (!forceRefresh && certsExpiresAtMs > now && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }

  const resp = await fetch(FIREBASE_CERTS_URL);
  if (!resp.ok) {
    throw new Error(`Unable to fetch Google public certificates (HTTP ${resp.status}).`);
  }

  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = /max-age=(\d+)/i.exec(cacheControl);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  const certs = (await resp.json()) as Record<string, string>;

  cachedCerts = certs;
  certsExpiresAtMs = now + Math.max(60, maxAgeSec) * 1000;
  return cachedCerts;
}

async function verifyFirebaseIdToken(
  token: string,
  projectId: string
): Promise<{ uid: string; email: string; emailVerified: boolean; name: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase authentication token.');
  }

  const [headerB64, payloadB64, sigB64] = parts;
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8')) as {
      alg?: unknown;
      kid?: unknown;
    };
  } catch {
    throw new Error('Invalid Firebase authentication token.');
  }

  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || !header.kid) {
    throw new Error('Unsupported token header.');
  }

  let certs = await fetchFirebasePublicCerts(false);
  let certPem = certs[header.kid];
  if (!certPem) {
    certs = await fetchFirebasePublicCerts(true);
    certPem = certs[header.kid];
  }
  if (!certPem) {
    throw new Error('Unknown Firebase signing key.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const validSig = verifier.verify(certPem, base64UrlToBuffer(sigB64));
  if (!validSig) {
    throw new Error('Invalid Firebase token signature.');
  }

  let payload: {
    exp?: unknown;
    iat?: unknown;
    auth_time?: unknown;
    aud?: unknown;
    iss?: unknown;
    sub?: unknown;
    email?: unknown;
    email_verified?: unknown;
    name?: unknown;
  };
  try {
    payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8')) as typeof payload;
  } catch {
    throw new Error('Invalid Firebase authentication token.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    throw new Error('Firebase authentication token has expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > nowSec + 300) {
    throw new Error('Firebase authentication token issued-at timestamp is invalid.');
  }
  if (typeof payload.auth_time !== 'number' || payload.auth_time > nowSec + 300) {
    throw new Error('Firebase authentication timestamp is invalid.');
  }
  if (payload.aud !== projectId) {
    throw new Error('Firebase authentication token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new Error('Firebase authentication token issuer mismatch.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) {
    throw new Error('Firebase authentication token subject is invalid.');
  }

  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : email;

  return {
    uid: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    name,
  };
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
      return { url: null, reason: 'APPS_SCRIPT_URL must point to script.google.com.' };
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

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeHttpUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Ignore invalid URL
  }
  return '';
}

function formatReadableTimestamp(iso?: string): string {
  if (!iso) return 'Not specified';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return escapeHtml(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

function renderBadgeHtml(label: string, tone: 'emerald' | 'rose' | 'amber' | 'slate'): string {
  const palette: Record<typeof tone, { bg: string; fg: string; border: string }> = {
    emerald: { bg: '#ecfdf5', fg: '#065f46', border: '#a7f3d0' },
    rose: { bg: '#fff1f2', fg: '#be123c', border: '#fecdd3' },
    amber: { bg: '#fffbeb', fg: '#92400e', border: '#fde68a' },
    slate: { bg: '#f1f5f9', fg: '#334155', border: '#cbd5e1' },
  };
  const c = palette[tone];
  return `<span style="display:inline-block;padding:4px 10px;border-radius:6px;background-color:${c.bg};color:${c.fg};border:1px solid ${c.border};font-size:12px;font-weight:700;letter-spacing:0.01em;">${escapeHtml(label)}</span>`;
}

function renderMetadataRows(rows: Array<{ label: string; value: string; mono?: boolean }>): string {
  if (rows.length === 0) return '';
  const cells = rows
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:12px;font-weight:600;color:#64748b;width:36%;vertical-align:top;">${escapeHtml(r.label)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:600;color:#0f172a;${
          r.mono ? 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' : ''
        }vertical-align:top;">${escapeHtml(r.value)}</td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden;background-color:#f8fafc;">
      ${cells}
    </table>
  `;
}

function wrapHtmlEmail(opts: {
  preheader: string;
  badgeLabel: string;
  badgeTone: 'emerald' | 'rose' | 'amber' | 'slate';
  heading: string;
  greeting: string;
  introParagraph: string;
  metadataRows?: Array<{ label: string; value: string; mono?: boolean }>;
  quoteLabel?: string;
  quoteBody?: string;
  noteParagraph?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const safeCtaUrl = opts.ctaUrl ? sanitizeHttpUrl(opts.ctaUrl) : '';
  const metadataHtml = opts.metadataRows ? renderMetadataRows(opts.metadataRows) : '';
  const quoteHtml =
    opts.quoteBody !== undefined
      ? `
      <div style="margin:18px 0;padding:14px 16px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
        ${
          opts.quoteLabel
            ? `<p style="margin:0 0 6px 0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;">${escapeHtml(opts.quoteLabel)}</p>`
            : ''
        }
        <p style="margin:0;font-size:13px;line-height:1.6;color:#334155;white-space:pre-line;">${escapeHtml(opts.quoteBody)}</p>
      </div>`
      : '';

  const ctaHtml =
    safeCtaUrl && opts.ctaLabel
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px 0;">
        <tr>
          <td style="border-radius:10px;background-color:#059669;">
            <a href="${escapeHtml(safeCtaUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(opts.ctaLabel)}</a>
          </td>
        </tr>
      </table>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:20px 28px;background-color:#059669;color:#ffffff;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:18px;font-weight:800;letter-spacing:-0.01em;color:#ffffff;">NIWAS Tasklet</td>
                  <td align="right" style="font-size:12px;font-weight:600;color:#d1fae5;">Activity Notification</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <div style="margin-bottom:14px;">${renderBadgeHtml(opts.badgeLabel, opts.badgeTone)}</div>
              <h1 style="margin:0 0 14px 0;font-size:20px;line-height:1.3;font-weight:800;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
              <p style="margin:0 0 12px 0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(opts.greeting)}</p>
              <p style="margin:0 0 8px 0;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(opts.introParagraph)}</p>
              ${metadataHtml}
              ${quoteHtml}
              ${
                opts.noteParagraph
                  ? `<p style="margin:14px 0 0 0;font-size:13px;line-height:1.6;color:#475569;">${escapeHtml(opts.noteParagraph)}</p>`
                  : ''
              }
              ${ctaHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.5;color:#64748b;">
              Sent automatically by <strong>NIWAS Tasklet</strong>. Please do not reply directly to this system notification.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildNotificationEmails(input: EmailPayloadInput): EmailMessageSpec[] {
  const actorLabel = input.actorName || input.actorEmail;
  const appUrl = sanitizeHttpUrl(input.appUrl);

  switch (input.event) {
    case 'user_added': {
      if (!input.targetEmail) return [];
      const name = input.targetName || input.targetEmail;
      const subject = 'Welcome to NIWAS Tasklet — Account Authorized';
      const intro = `${actorLabel} (${input.actorEmail}) has authorized your Google account to access NIWAS Tasklet.`;
      const note =
        'Sign in with your authorized Google account to create deadline tasklets, optionally assign a Supervisor in Settings, and track progress.';
      return [
        {
          to: input.targetEmail,
          subject,
          html: wrapHtmlEmail({
            preheader: `${actorLabel} added you to NIWAS Tasklet.`,
            badgeLabel: 'Account Added',
            badgeTone: 'emerald',
            heading: 'You Have Been Added to NIWAS Tasklet',
            greeting: `Hello ${name},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Authorized Account', value: input.targetEmail },
              { label: 'Added By', value: `${actorLabel} (${input.actorEmail})` },
            ],
            noteParagraph: note,
            ctaLabel: appUrl ? 'Open NIWAS Tasklet' : undefined,
            ctaUrl: appUrl || undefined,
          }),
          text: `Hello ${name},\n\n${intro}\n\nAuthorized Account: ${input.targetEmail}\nAdded By: ${actorLabel} (${input.actorEmail})\n\n${note}${appUrl ? `\n\nOpen NIWAS Tasklet: ${appUrl}` : ''}`,
        },
      ];
    }

    case 'user_removed': {
      if (!input.targetEmail) return [];
      const name = input.targetName || input.targetEmail;
      const subject = 'NIWAS Tasklet — Account Access Removed';
      const intro = `${actorLabel} (${input.actorEmail}) has removed your account from the NIWAS Tasklet authorized users directory.`;
      const note =
        'You will no longer be able to sign in or be tagged as a Supervisor. If this was unexpected, please contact the Admin.';
      return [
        {
          to: input.targetEmail,
          subject,
          html: wrapHtmlEmail({
            preheader: 'Your NIWAS Tasklet access has been removed.',
            badgeLabel: 'Access Removed',
            badgeTone: 'rose',
            heading: 'Account Access Removed',
            greeting: `Hello ${name},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Account', value: input.targetEmail },
              { label: 'Removed By', value: `${actorLabel} (${input.actorEmail})` },
            ],
            noteParagraph: note,
          }),
          text: `Hello ${name},\n\n${intro}\n\n${note}`,
        },
      ];
    }

    case 'user_data_cleared': {
      if (!input.targetEmail) return [];
      const name = input.targetName || input.targetEmail;
      const scope = input.scopeDescription || 'selected tasklet data';
      const subject = 'NIWAS Tasklet — Tasklet Data Cleared by Admin';
      const intro = `${actorLabel} (${input.actorEmail}) permanently cleared ${scope} under your account.`;
      return [
        {
          to: input.targetEmail,
          subject,
          html: wrapHtmlEmail({
            preheader: `Admin cleared ${scope} for your account.`,
            badgeLabel: 'Data Cleared',
            badgeTone: 'amber',
            heading: 'Tasklet Data Cleared',
            greeting: `Hello ${name},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Account', value: input.targetEmail },
              { label: 'Deletion Scope', value: scope },
              { label: 'Action By', value: `${actorLabel} (${input.actorEmail})` },
            ],
            ctaLabel: appUrl ? 'Open NIWAS Tasklet' : undefined,
            ctaUrl: appUrl || undefined,
          }),
          text: `Hello ${name},\n\n${intro}\n\nDeletion Scope: ${scope}\nAction By: ${actorLabel} (${input.actorEmail})`,
        },
      ];
    }

    case 'supervisor_assigned': {
      if (!input.supervisorEmail) return [];
      const supName = input.supervisorName || input.supervisorEmail;
      const subject = `NIWAS Tasklet — ${actorLabel} Tagged You as Supervisor`;
      const intro = `${actorLabel} (${input.actorEmail}) has designated you as their Supervisor in NIWAS Tasklet.`;
      const note =
        'Any tasklets they share with "Viewable to supervisor" will appear in your Supervisor view, where you can add notes, Close, or Abandon them.';
      return [
        {
          to: input.supervisorEmail,
          subject,
          html: wrapHtmlEmail({
            preheader: `${actorLabel} designated you as their Supervisor.`,
            badgeLabel: 'Supervisor Role',
            badgeTone: 'emerald',
            heading: 'You Were Designated as a Supervisor',
            greeting: `Hello ${supName},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Team Member', value: `${actorLabel} (${input.actorEmail})` },
              { label: 'Assigned Supervisor', value: `${supName} (${input.supervisorEmail})` },
            ],
            noteParagraph: note,
            ctaLabel: appUrl ? 'View Supervisor Workspace' : undefined,
            ctaUrl: appUrl || undefined,
          }),
          text: `Hello ${supName},\n\n${intro}\n\n${note}${appUrl ? `\n\nOpen NIWAS Tasklet: ${appUrl}` : ''}`,
        },
      ];
    }

    case 'supervisor_changed': {
      const messages: EmailMessageSpec[] = [];
      if (input.supervisorEmail) {
        const supName = input.supervisorName || input.supervisorEmail;
        const intro = `${actorLabel} (${input.actorEmail}) has updated their Supervisor setting and designated you as their new Supervisor.`;
        const note =
          'Tasklets they create with "Viewable to supervisor" will appear in your Supervisor view with full update, Close, and Abandon permissions.';
        messages.push({
          to: input.supervisorEmail,
          subject: `NIWAS Tasklet — ${actorLabel} Tagged You as Supervisor`,
          html: wrapHtmlEmail({
            preheader: `${actorLabel} designated you as their new Supervisor.`,
            badgeLabel: 'Supervisor Assigned',
            badgeTone: 'emerald',
            heading: 'You Were Designated as a Supervisor',
            greeting: `Hello ${supName},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Team Member', value: `${actorLabel} (${input.actorEmail})` },
              { label: 'New Supervisor', value: `${supName} (${input.supervisorEmail})` },
            ],
            noteParagraph: note,
            ctaLabel: appUrl ? 'Open NIWAS Tasklet' : undefined,
            ctaUrl: appUrl || undefined,
          }),
          text: `Hello ${supName},\n\n${intro}\n\n${note}`,
        });
      }
      if (input.previousSupervisorEmail && input.previousSupervisorEmail !== input.supervisorEmail) {
        const prevName = input.previousSupervisorName || input.previousSupervisorEmail;
        const intro = `${actorLabel} (${input.actorEmail}) has reassigned their default Supervisor in NIWAS Tasklet.`;
        const note =
          'Future tasklets from this team member will be routed to their newly selected Supervisor. Any existing tasklets already tagged to you remain accessible.';
        messages.push({
          to: input.previousSupervisorEmail,
          subject: `NIWAS Tasklet — ${actorLabel} Changed Their Supervisor`,
          html: wrapHtmlEmail({
            preheader: `${actorLabel} changed their default Supervisor.`,
            badgeLabel: 'Supervisor Updated',
            badgeTone: 'slate',
            heading: 'Supervisor Assignment Changed',
            greeting: `Hello ${prevName},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Team Member', value: `${actorLabel} (${input.actorEmail})` },
              { label: 'Previous Supervisor', value: `${prevName} (${input.previousSupervisorEmail})` },
            ],
            noteParagraph: note,
          }),
          text: `Hello ${prevName},\n\n${intro}\n\n${note}`,
        });
      }
      return messages;
    }

    case 'supervisor_removed': {
      if (!input.previousSupervisorEmail) return [];
      const prevName = input.previousSupervisorName || input.previousSupervisorEmail;
      const intro = `${actorLabel} (${input.actorEmail}) cleared their default Supervisor assignment in NIWAS Tasklet.`;
      const note =
        'New tasklets created by this member will remain private unless they assign a Supervisor again. Existing tasklets already tagged to you remain visible.';
      return [
        {
          to: input.previousSupervisorEmail,
          subject: `NIWAS Tasklet — ${actorLabel} Removed Supervisor Assignment`,
          html: wrapHtmlEmail({
            preheader: `${actorLabel} cleared their Supervisor setting.`,
            badgeLabel: 'Supervisor Cleared',
            badgeTone: 'slate',
            heading: 'Supervisor Assignment Cleared',
            greeting: `Hello ${prevName},`,
            introParagraph: intro,
            metadataRows: [{ label: 'Team Member', value: `${actorLabel} (${input.actorEmail})` }],
            noteParagraph: note,
          }),
          text: `Hello ${prevName},\n\n${intro}\n\n${note}`,
        },
      ];
    }

    case 'tasklet_created_supervisor': {
      if (!input.supervisorEmail || !input.taskletSeq || !input.taskletTitle) return [];
      const supName = input.supervisorName || input.supervisorEmail;
      const seqStr = `#${input.taskletSeq}`;
      const deadlineStr = formatReadableTimestamp(input.taskletDeadlineISO);
      const subject = `[${seqStr}] New Tasklet Shared With You: ${input.taskletTitle}`;
      const intro = `${actorLabel} (${input.actorEmail}) created a new tasklet and shared it with you as Supervisor.`;
      return [
        {
          to: input.supervisorEmail,
          subject,
          html: wrapHtmlEmail({
            preheader: `${seqStr} ${input.taskletTitle} — Due ${deadlineStr}`,
            badgeLabel: `${seqStr} · Active Tasklet`,
            badgeTone: 'emerald',
            heading: input.taskletTitle,
            greeting: `Hello ${supName},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Tasklet ID', value: seqStr, mono: true },
              { label: 'Assigned By', value: `${actorLabel} (${input.actorEmail})` },
              { label: 'Deadline', value: deadlineStr, mono: true },
            ],
            noteParagraph:
              'You can add progress notes, Close, or Abandon this tasklet directly from your Supervisor view.',
            ctaLabel: appUrl ? `Open Tasklet ${seqStr}` : undefined,
            ctaUrl: appUrl || undefined,
          }),
          text: `Hello ${supName},\n\n${intro}\n\nTasklet: ${seqStr} ${input.taskletTitle}\nDeadline: ${deadlineStr}${appUrl ? `\n\nOpen: ${appUrl}` : ''}`,
        },
      ];
    }

    case 'tasklet_closed':
    case 'tasklet_abandoned': {
      if (!input.recipientEmail || !input.taskletSeq || !input.taskletTitle) return [];
      const isClosed = input.event === 'tasklet_closed';
      const statusWord = isClosed ? 'Closed' : 'Abandoned';
      const seqStr = `#${input.taskletSeq}`;
      const recipientName = input.recipientName || input.recipientEmail;
      const resolvedStr = formatReadableTimestamp(input.resolvedAtISO);
      const deadlineStr = formatReadableTimestamp(input.taskletDeadlineISO);
      const subject = `[${seqStr}] Tasklet ${statusWord}: ${input.taskletTitle}`;
      const intro = `${actorLabel} (${input.actorEmail}) marked tasklet ${seqStr} as ${statusWord}.`;
      return [
        {
          to: input.recipientEmail,
          subject,
          html: wrapHtmlEmail({
            preheader: `${seqStr} ${input.taskletTitle} was marked ${statusWord} by ${actorLabel}.`,
            badgeLabel: `${seqStr} · ${statusWord}`,
            badgeTone: isClosed ? 'emerald' : 'amber',
            heading: input.taskletTitle,
            greeting: `Hello ${recipientName},`,
            introParagraph: intro,
            metadataRows: [
              { label: 'Tasklet ID', value: seqStr, mono: true },
              { label: 'Final Status', value: statusWord },
              { label: `${statusWord} By`, value: `${actorLabel} (${input.actorEmail})` },
              { label: 'Original Deadline', value: deadlineStr, mono: true },
              { label: `${statusWord} On`, value: resolvedStr, mono: true },
            ],
            quoteLabel: 'Final Recorded Description',
            quoteBody: input.taskletDescription || 'No description provided.',
            ctaLabel: appUrl ? 'View Archived Tasklet' : undefined,
            ctaUrl: appUrl || undefined,
          }),
          text: `Hello ${recipientName},\n\n${intro}\n\nTasklet: ${seqStr} ${input.taskletTitle}\nStatus: ${statusWord}\nFinal Description:\n${input.taskletDescription || 'No description provided.'}`,
        },
      ];
    }
  }
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

  const urlCheck = parseSafeAppsScriptUrl(process.env.APPS_SCRIPT_URL || '');
  const appsScriptSecret = (process.env.APPS_SCRIPT_SECRET || '').trim();

  if (!urlCheck.url) {
    return {
      configured: false,
      deliveredCount: 0,
      failedCount: messages.length,
      lastError: urlCheck.reason || 'Email delivery is not configured on the server.',
    };
  }

  let deliveredCount = 0;
  let failedCount = 0;
  let lastError: string | undefined;

  for (const msg of messages) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(urlCheck.url, {
        method: 'POST',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          secret: appsScriptSecret,
          to: msg.to,
          subject: msg.subject,
          htmlBody: msg.html,
          textBody: msg.text,
          senderName: 'NIWAS Tasklet',
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

  const projectId = loadFirebaseProjectId();
  if (!projectId) {
    return {
      status: 500,
      body: { ok: false, error: 'Firebase project configuration is missing on the server.' },
    };
  }

  let authUser: { uid: string; email: string; name: string };
  try {
    const decoded = await verifyFirebaseIdToken(token, projectId);
    if (!decoded.email || !decoded.emailVerified) {
      return { status: 403, body: { ok: false, error: 'Verified email required.' } };
    }
    authUser = {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email,
    };
  } catch (err) {
    return {
      status: 401,
      body: {
        ok: false,
        error:
          err instanceof Error ? err.message : 'Invalid or expired Firebase authentication token.',
      },
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

export default async function handler(
  req: VercelApiRequest,
  res: VercelApiResponse
): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }

    const rawAuth = req.headers?.authorization ?? req.headers?.Authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;

    let parsedBody: unknown = req.body;
    if (typeof req.body === 'string') {
      if (req.body.length > 65536) {
        res.status(413).json({ ok: false, error: 'Payload too large.' });
        return;
      }
      try {
        parsedBody = JSON.parse(req.body);
      } catch {
        res.status(400).json({ ok: false, error: 'Invalid JSON request body.' });
        return;
      }
    }

    const result = await handleNotifyRequest(authHeader, parsedBody);
    res.status(result.status).json(result.body);
  } catch (err) {
    console.error('[api/notify] Unhandled error:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Internal notification server error.',
    });
  }
}
