import { auth } from '../lib/firebase';

export type ClientEmailEvent =
  | 'user_added'
  | 'user_removed'
  | 'user_data_cleared'
  | 'supervisor_assigned'
  | 'supervisor_changed'
  | 'supervisor_removed'
  | 'tasklet_created_supervisor'
  | 'tasklet_closed'
  | 'tasklet_abandoned';

export interface NotifyEmailPayload {
  event: ClientEmailEvent;
  actorName?: string;
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

export interface EmailSendResult {
  configured: boolean;
  delivered: boolean;
  deliveredCount: number;
  failedCount: number;
  skippedPreview?: boolean;
  error?: string;
}

export async function sendEmailNotification(payload: NotifyEmailPayload): Promise<EmailSendResult> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    return {
      configured: false,
      delivered: false,
      deliveredCount: 0,
      failedCount: 0,
      skippedPreview: true,
      error: 'Live emails are skipped in Design Preview.',
    };
  }

  try {
    const idToken = await currentUser.getIdToken();
    const res = await fetch('/api/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    let data: Partial<EmailSendResult> & { error?: string } = {};
    try {
      data = (await res.json()) as Partial<EmailSendResult> & { error?: string };
    } catch {
      data = {};
    }

    if (!res.ok) {
      return {
        configured: false,
        delivered: false,
        deliveredCount: 0,
        failedCount: 1,
        error: data.error || `Notification server error (${res.status}).`,
      };
    }

    return {
      configured: Boolean(data.configured),
      delivered: Boolean(data.delivered),
      deliveredCount: Number(data.deliveredCount || 0),
      failedCount: Number(data.failedCount || 0),
      error: data.error,
    };
  } catch (err) {
    return {
      configured: false,
      delivered: false,
      deliveredCount: 0,
      failedCount: 1,
      error: err instanceof Error ? err.message : 'Network error calling email service.',
    };
  }
}
