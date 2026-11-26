import { handleNotifyRequest } from '../server/notifyCore.ts';

interface VercelApiRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (payload: unknown) => void;
}

export default async function handler(
  req: VercelApiRequest,
  res: VercelApiResponse
): Promise<void> {
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
}
