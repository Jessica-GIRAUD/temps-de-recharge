// Transforme la réponse GET /ev/{id}/battery d'EVKX en courbe simple [[% de batterie, kW], …].
//
// ⚠️ À VALIDER avec une vraie réponse : la doc publique donne seulement l'enveloppe
// ([{ grossCapacityKwh, netCapacityKwh, chargeCurves: [...] }]), pas le détail des points.
// Les noms de champs ci-dessous sont donc des hypothèses tolérantes. Si rien n'est reconnu,
// on renvoie [] et le site garde la courbe d'Open EV Data (aucune casse).
// Après réception de la clé : `npm run check:evkx`, puis ajuste `pointsOf` si besoin.

const num = (v) => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const pick = (o, keys) => {
  if (!o || typeof o !== 'object') return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

export function pointsOf(curve) {
  const raw = Array.isArray(curve) ? curve : pick(curve, ['points', 'curve', 'data', 'values', 'samples', 'chargeCurve']);
  if (!Array.isArray(raw)) return null;
  const pts = [];
  for (const p of raw) {
    let soc;
    let kw;
    if (Array.isArray(p)) {
      soc = num(p[0]);
      kw = num(p[1]);
    } else {
      soc = num(pick(p, ['soc', 'stateOfCharge', 'percentage', 'percent', 'level', 'x']));
      kw = num(pick(p, ['power', 'powerKw', 'kw', 'kilowatts', 'y']));
    }
    if (soc !== null && kw !== null && soc >= 0 && soc <= 100 && kw > 0) pts.push([Math.round(soc * 10) / 10, Math.round(kw * 10) / 10]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  return pts.length >= 3 ? pts : null;
}

const isDc = (curve) =>
  /dc|ccs|chademo|fast|rapid/i.test(JSON.stringify(pick(curve, ['type', 'chargingType', 'currentType', 'connector', 'connectorType', 'name']) ?? ''));

// Retourne [{ net, curve }] : une entrée par batterie qui expose au moins une courbe exploitable (DC de préférence).
export function normalizeBattery(json) {
  const list = Array.isArray(json) ? json : [json];
  const out = [];
  for (const b of list) {
    const net = num(pick(b, ['netCapacityKwh', 'usableCapacityKwh', 'netCapacity']));
    const curves = pick(b, ['chargeCurves', 'chargingCurves', 'curves']);
    if (net === null || !Array.isArray(curves)) continue;
    const peak = (pts) => Math.max(...pts.map((p) => p[1]));
    const candidates = curves
      .map((c) => ({ pts: pointsOf(c), dc: isDc(c) }))
      .filter((c) => c.pts)
      .sort((a, b) => Number(b.dc) - Number(a.dc) || peak(b.pts) - peak(a.pts));
    if (candidates.length) out.push({ net, curve: candidates[0].pts });
  }
  return out;
}
