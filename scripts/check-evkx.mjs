// Vérifie la chaîne complète une fois ta clé enregistrée par EVKX :  npm run check:evkx
// (lit EVKX_CLIENT_ID / EVKX_PRIVATE_KEY dans .env)
import { evkxGet, getToken, isConfigured, PREFIX } from '../api/_evkx.js';
import { normalizeBattery } from '../api/_curve.js';

if (!isConfigured()) {
  console.error('EVKX_CLIENT_ID et EVKX_PRIVATE_KEY doivent être définis dans .env (voir .env.example).');
  process.exit(1);
}

const cut = (s, n = 500) => (s.length > n ? `${s.slice(0, n)} …` : s);

try {
  const token = await getToken();
  console.log(`1. Jeton obtenu (${token.length} caractères).`);

  const search = await evkxGet(`${PREFIX}/ev/search?query=micra&pageSize=3`);
  console.log(`2. /ev/search -> HTTP ${search.status}\n   ${cut(search.text)}`);

  const items = JSON.parse(search.text).items || [];
  if (!items[0]) process.exit(0);

  const battery = await evkxGet(`${PREFIX}/ev/${items[0].id}/battery`);
  console.log(`3. /ev/${items[0].id}/battery -> HTTP ${battery.status}\n   ${cut(battery.text, 1200)}`);

  const parsed = normalizeBattery(JSON.parse(battery.text));
  console.log(`4. Courbes reconnues par api/_curve.js : ${parsed.length}`);
  if (!parsed.length) console.log('   Rien de reconnu : envoie-moi la réponse du point 3 et j’ajuste pointsOf().');
  else console.log(`   ex. ${parsed[0].net} kWh, ${parsed[0].curve.length} points, pic ${Math.max(...parsed[0].curve.map((p) => p[1]))} kW`);
} catch (e) {
  console.error(`Échec : ${e.message}`);
  if (e.body) console.error(e.body);
  process.exit(1);
}
