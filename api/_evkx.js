// Client minimal de l'API externe EVKX (authentification JWT-bearer).
// Le préfixe "_" empêche Vercel d'en faire une route publique.
//
// Principe (cf. ONBOARDING.md du dépôt github.com/evkx/evkxapi) :
//   1. on signe une assertion RS256 de 5 min avec la clé PRIVÉE (iss = client id)
//   2. on l'échange sur POST /api/external/v1/auth/token (champ de formulaire "assertion")
//   3. on met le jeton en cache (valable 10 h) et on l'envoie en "Authorization: Bearer"
// La clé privée ne quitte jamais le serveur : ce fichier ne doit JAMAIS être importé côté navigateur.

import { createSign, randomUUID } from 'node:crypto';

export const PREFIX = '/api/external/v1';

const base = () => (process.env.EVKX_BASE_URL || 'https://evkx.net').replace(/\/$/, '');
const b64u = (x) => Buffer.from(x).toString('base64url');

let cache = { token: null, expiresAt: 0 };

export class EvkxError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export function isConfigured() {
  return Boolean(process.env.EVKX_CLIENT_ID && process.env.EVKX_PRIVATE_KEY);
}

// Accepte le PEM multi-lignes (Vercel) comme la version "\n" échappés (.env)
const privateKeyPem = () => String(process.env.EVKX_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

export function createAssertion(
  clientId = process.env.EVKX_CLIENT_ID,
  pem = privateKeyPem(),
  now = Math.floor(Date.now() / 1000),
) {
  const header = { alg: 'RS256', typ: 'JWT', kid: clientId };
  const payload = {
    iss: clientId,
    sub: clientId,
    jti: randomUUID().replace(/-/g, ''),
    iat: now,
    nbf: now,
    exp: now + 300,
  };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(input).sign(pem);
  return `${input}.${b64u(signature)}`;
}

export async function getToken(force = false) {
  if (!isConfigured()) throw new EvkxError('EVKX non configuré (EVKX_CLIENT_ID / EVKX_PRIVATE_KEY).', 503);
  if (!force && cache.token && Date.now() < cache.expiresAt - 5 * 60 * 1000) return cache.token;

  const res = await fetch(`${base()}${PREFIX}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ assertion: createAssertion() }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new EvkxError(
      `Échange de jeton refusé (${res.status}). Ton identifiant client est-il enregistré chez EVKX ?`,
      res.status,
      text,
    );
  }
  const json = JSON.parse(text);
  cache = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 36000) * 1000 };
  return cache.token;
}

// Garde-fou : l'accès partenaire est limité en débit. On plafonne les appels sortants par instance.
const calls = [];
const MAX_CALLS_PER_MINUTE = 40;
function budget() {
  const now = Date.now();
  while (calls.length && now - calls[0] > 60_000) calls.shift();
  if (calls.length >= MAX_CALLS_PER_MINUTE) throw new EvkxError('Trop de requêtes vers EVKX, réessaie dans une minute.', 429);
  calls.push(now);
}

export async function evkxGet(path) {
  budget();
  const call = async (token) =>
    fetch(`${base()}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });

  let res = await call(await getToken());
  if (res.status === 401) res = await call(await getToken(true)); // jeton révoqué ou expiré : un seul nouvel essai
  return { status: res.status, text: await res.text() };
}

// Réponse HTTP : on relaie le JSON d'EVKX, avec cache CDN pour ménager le quota (ttl en secondes).
export function forward(res, result, ttl) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    result.status === 200 ? `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 7}` : 'no-store',
  );
  return res.status(result.status).send(result.text);
}

export function fail(res, error) {
  const status = error instanceof EvkxError && error.status >= 400 && error.status < 600 ? error.status : 502;
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status === 401 || status === 403 ? 502 : status).json({ error: error.message });
}
