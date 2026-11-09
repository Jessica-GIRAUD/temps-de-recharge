// GET /api/evkx/search?query=ioniq  ->  relais de GET /ev/search (scope evkx:external:search)
import { evkxGet, fail, forward, isConfigured, PREFIX } from '../_evkx.js';

export default async function handler(req, res) {
  if (!isConfigured()) return res.status(503).json({ error: 'EVKX non configuré.' });
  const query = String(req.query.query || '').trim().slice(0, 60);
  if (query.length < 2 || !/^[\p{L}\p{N} .+\-]+$/u.test(query)) return res.status(400).json({ error: 'Paramètre "query" invalide.' });
  try {
    return forward(res, await evkxGet(`${PREFIX}/ev/search?query=${encodeURIComponent(query)}&pageSize=10`), 86400);
  } catch (e) {
    return fail(res, e);
  }
}
