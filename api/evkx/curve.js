// GET /api/evkx/curve?brand=Nissan&model=Micra&capacity=52
// Cherche le véhicule chez EVKX, lit sa batterie, renvoie la courbe de charge mesurée
// { id, net, curve: [[%, kW], …], source: "EVKX.net" } ou 404 si rien de fiable n'est trouvé.
// Appelé à la demande, une seule fois par véhicule choisi, puis mis en cache CDN 24 h :
// pas d'aspiration du catalogue, conformément à l'accès partenaire limité.
import { evkxGet, fail, isConfigured, PREFIX } from '../_evkx.js';
import { normalizeBattery } from '../_curve.js';

const TEXT = /^[\p{L}\p{N} .+\-]{1,60}$/u;
const fold = (s) => String(s || '').toLowerCase().replace(/[\s\-.]/g, '');
const MAX_CANDIDATES = 5;
const TOLERANCE = 0.04; // écart max entre la capacité d'Open EV Data et la capacité nette EVKX

export default async function handler(req, res) {
  if (!isConfigured()) return res.status(503).json({ error: 'EVKX non configuré.' });

  const brand = String(req.query.brand || '').trim();
  const model = String(req.query.model || '').trim();
  const capacity = Number(String(req.query.capacity || '').replace(',', '.'));
  if (!TEXT.test(brand) || !TEXT.test(model) || !Number.isFinite(capacity) || capacity <= 0 || capacity > 300) {
    return res.status(400).json({ error: 'Paramètres brand / model / capacity invalides.' });
  }

  try {
    const search = await evkxGet(`${PREFIX}/ev/search?query=${encodeURIComponent(`${brand} ${model}`)}&pageSize=10`);
    if (search.status !== 200) return res.status(search.status === 404 ? 404 : 502).json({ error: `Recherche EVKX : HTTP ${search.status}` });

    const json = JSON.parse(search.text);
    const items = Array.isArray(json) ? json : json.items || [];
    const sameBrand = items.filter((it) => fold(it.brand) === fold(brand));
    const sameModel = sameBrand.filter((it) => fold(it.model).includes(fold(model)) || fold(model).includes(fold(it.model)));
    const candidates = (sameModel.length ? sameModel : sameBrand).slice(0, MAX_CANDIDATES);

    let best = null;
    for (const it of candidates) {
      if (!it.id) continue;
      const bat = await evkxGet(`${PREFIX}/ev/${it.id}/battery`);
      if (bat.status !== 200) continue;
      for (const entry of normalizeBattery(JSON.parse(bat.text))) {
        const gap = Math.abs(entry.net - capacity) / capacity;
        if (gap <= TOLERANCE && (!best || gap < best.gap)) best = { gap, id: it.id, ...entry };
      }
    }

    if (!best) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(404).json({ error: 'Aucune courbe mesurée trouvée pour ce véhicule.' });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({ id: best.id, net: best.net, curve: best.curve, source: 'EVKX.net' });
  } catch (e) {
    return fail(res, e);
  }
}
