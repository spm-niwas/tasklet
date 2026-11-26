interface VercelApiRequest {
  method?: string;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (payload: unknown) => void;
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

export function getEmailHealth(): { ok: true; emailConfigured: boolean; reason?: string } {
  const check = parseSafeAppsScriptUrl(process.env.APPS_SCRIPT_URL || '');
  return check.url
    ? { ok: true, emailConfigured: true }
    : { ok: true, emailConfigured: false, reason: check.reason };
}

export default function handler(req: VercelApiRequest, res: VercelApiResponse): void {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }
    res.status(200).json(getEmailHealth());
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Health check failed.',
    });
  }
}
