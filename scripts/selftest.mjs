// Test de bout en bout SANS réseau : un faux serveur EVKX vérifie la signature RS256 comme le vrai le ferait
// (JWK enregistrée, kid = iss, durée ≤ 5 min), puis on appelle nos fonctions serverless.
//   npm test
// Les formes de réponse /ev/search et /ev/{id}/battery sont celles de l'exemple officiel ;
// le détail des points de courbe est SUPPOSÉ (voir api/_curve.js).
import http from 'node:http';
import assert from 'node:assert/strict';
import { createPublicKey, createVerify, generateKeyPairSync } from 'node:crypto';

const CLIENT = 'selftest-client';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), use: 'sig', alg: 'RS256', kid: CLIENT };

const ID52 = '11111111-1111-4111-8111-111111111111';
const ID40 = '22222222-2222-4222-8222-222222222222';
const EVS = [
  { id: ID40, brand: 'Nissan', model: 'Micra', variant: '40 kWh' },
  { id: ID52, brand: 'Nissan', model: 'Micra', variant: '52 kWh' },
];
const curve = (peak) => ({ type: 'DC', points: [{ soc: 0, power: 20 }, { soc: 10, power: peak - 10 }, { soc: 50, power: peak }, { soc: 80, power: peak / 2 }, { soc: 100, power: 10 }] });
const BATTERY = {
  [ID40]: [{ grossCapacityKwh: 42, netCapacityKwh: 40, chargeCurves: [curve(80)] }],
  [ID52]: [{ grossCapacityKwh: 55, netCapacityKwh: 52, chargeCurves: [{ type: 'AC', points: [{ soc: 0, power: 11 }, { soc: 50, power: 11 }, { soc: 100, power: 5 }] }, curve(100)] }],
};

let exchanges = 0;
let revokeNext = false;
const stats = { search: 0, battery: 0 };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'POST' && url.pathname === '/api/external/v1/auth/token') {
    let body = '';
    for await (const c of req) body += c;
    const assertion = new URLSearchParams(body).get('assertion');
    if (!assertion) return send(400, { error: 'assertion manquante' });
    const [h, p, s] = assertion.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    const payload = JSON.parse(Buffer.from(p, 'base64url'));
    const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
    if (!ok || header.alg !== 'RS256' || header.kid !== CLIENT || payload.iss !== CLIENT || payload.exp - payload.iat > 300 || !payload.jti) {
      return send(401, { error: 'Invalid or expired JWT grant' });
    }
    exchanges += 1;
    return send(200, { access_token: `tok-${exchanges}`, token_type: 'Bearer', expires_in: 36000 });
  }

  if (req.headers.authorization !== `Bearer tok-${exchanges}` || revokeNext) {
    revokeNext = false;
    return send(401, { error: 'bad token' });
  }
  if (url.pathname === '/api/external/v1/ev/search') {
    stats.search += 1;
    const q = (url.searchParams.get('query') || '').toLowerCase();
    return send(200, { items: EVS.filter((e) => q.split(' ').every((t) => `${e.brand} ${e.model}`.toLowerCase().includes(t))) });
  }
  const m = url.pathname.match(/^\/api\/external\/v1\/ev\/([^/]+)\/battery$/);
  if (m && BATTERY[m[1]]) { stats.battery += 1; return send(200, BATTERY[m[1]]); }
  return send(404, { error: 'not found' });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

// --- configuration (clé privée au format "\n" échappés, comme dans un .env) ---
process.env.EVKX_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.EVKX_CLIENT_ID = CLIENT;
process.env.EVKX_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');

const mock = (query = {}) => {
  const r = { statusCode: 200, headers: {}, body: null, query };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.body = o; return r; };
  r.send = (t) => { r.body = typeof t === 'string' ? JSON.parse(t) : t; return r; };
  return r;
};
const call = async (file, query) => { const r = mock(query); await (await import(file)).default({ query }, r); return r; };

let passed = 0;
const t = async (name, fn) => { await fn(); passed += 1; console.log(`  ✓ ${name}`); };

try {
  await t('status : configuré', async () => {
    const r = await call('../api/evkx/status.js', {});
    assert.equal(r.body.enabled, true);
  });
  await t('search : jeton échangé puis relayé, mis en cache CDN', async () => {
    const r = await call('../api/evkx/search.js', { query: 'micra' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.items.length, 2);
    assert.match(r.headers['Cache-Control'], /s-maxage=86400/);
    assert.equal(exchanges, 1);
  });
  await t('jeton réutilisé (pas de nouvel échange)', async () => {
    await call('../api/evkx/search.js', { query: 'micra' });
    assert.equal(exchanges, 1);
  });
  await t('jeton révoqué : un seul nouvel échange, puis succès', async () => {
    revokeNext = true;
    const r = await call('../api/evkx/search.js', { query: 'micra' });
    assert.equal(r.statusCode, 200);
    assert.equal(exchanges, 2);
  });
  await t('entrées invalides refusées (400)', async () => {
    assert.equal((await call('../api/evkx/search.js', { query: 'a' })).statusCode, 400);
    assert.equal((await call('../api/evkx/search.js', { query: '<script>' })).statusCode, 400);
    assert.equal((await call('../api/evkx/battery.js', { id: '../../etc/passwd' })).statusCode, 400);
    assert.equal((await call('../api/evkx/curve.js', { brand: 'Nissan', model: 'Micra', capacity: 'abc' })).statusCode, 400);
  });
  await t('battery : relais direct', async () => {
    const r = await call('../api/evkx/battery.js', { id: ID52 });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body[0].netCapacityKwh, 52);
  });
  await t('curve : choisit la batterie 52 kWh et la courbe DC (pas l’AC)', async () => {
    const r = await call('../api/evkx/curve.js', { brand: 'Nissan', model: 'Micra', capacity: '52' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.id, ID52);
    assert.equal(r.body.source, 'EVKX.net');
    assert.equal(Math.max(...r.body.curve.map((p) => p[1])), 100);
  });
  await t('curve : capacité inconnue -> 404 sans casser le site', async () => {
    const r = await call('../api/evkx/curve.js', { brand: 'Nissan', model: 'Micra', capacity: '75' });
    assert.equal(r.statusCode, 404);
  });
  await t('non configuré : 503 et status = false', async () => {
    const saved = process.env.EVKX_PRIVATE_KEY;
    delete process.env.EVKX_PRIVATE_KEY;
    assert.equal((await call('../api/evkx/status.js', {})).body.enabled, false);
    assert.equal((await call('../api/evkx/curve.js', { brand: 'a', model: 'b', capacity: 50 })).statusCode, 503);
    process.env.EVKX_PRIVATE_KEY = saved;
  });
  console.log(`\n${passed} tests OK (échanges de jeton : ${exchanges}, recherches : ${stats.search}, batteries : ${stats.battery})`);
} catch (e) {
  console.error('\n✗ Échec :', e.message);
  process.exitCode = 1;
} finally {
  server.close();
}
