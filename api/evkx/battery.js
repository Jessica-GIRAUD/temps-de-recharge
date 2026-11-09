// GET /api/evkx/battery?id=<uuid>  ->  relais de GET /ev/{id}/battery (scope evkx:external:battery)
// Utile pour inspecter la vraie forme des courbes de charge (voir `npm run check:evkx`).
import { evkxGet, fail, forward, isConfigured, PREFIX } from '../_evkx.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!isConfigured()) return res.status(503).json({ error: 'EVKX non configuré.' });
  const id = String(req.query.id || '');
  if (!UUID.test(id)) return res.status(400).json({ error: 'Paramètre "id" invalide.' });
  try {
    return forward(res, await evkxGet(`${PREFIX}/ev/${id}/battery`), 604800);
  } catch (e) {
    return fail(res, e);
  }
}
