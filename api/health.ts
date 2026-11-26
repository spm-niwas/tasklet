import { getEmailHealth } from '../server/notifyCore.ts';

interface VercelApiRequest {
  method?: string;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (payload: unknown) => void;
}

export default function handler(req: VercelApiRequest, res: VercelApiResponse): void {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }
  res.status(200).json(getEmailHealth());
}
