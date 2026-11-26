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

export interface EmailMessageSpec {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailPayloadInput {
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

export function buildNotificationEmails(input: EmailPayloadInput): EmailMessageSpec[] {
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
            metadataRows: [
              { label: 'Team Member', value: `${actorLabel} (${input.actorEmail})` },
            ],
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
            noteParagraph: 'You can add progress notes, Close, or Abandon this tasklet directly from your Supervisor view.',
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
