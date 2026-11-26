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

    if (!res.ok) {
      return {
        configured: false,
        delivered: false,
        deliveredCount: 0,
        failedCount: 1,
      };
    }

    const data = (await res.json()) as Partial<EmailSendResult>;
    return {
      configured: Boolean(data.configured),
      delivered: Boolean(data.delivered),
      deliveredCount: Number(data.deliveredCount || 0),
      failedCount: Number(data.failedCount || 0),
    };
  } catch {
    return {
      configured: false,
      delivered: false,
      deliveredCount: 0,
      failedCount: 1,
    };
  }
}
