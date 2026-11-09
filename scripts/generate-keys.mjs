// Génère la paire de clés pour l'API EVKX (équivalent du outil .NET "keygen", sans .NET).
//   node scripts/generate-keys.mjs <client-id>
// Choisis l'identifiant AVANT : il est inscrit dans la clé publique (kid).
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

const id = process.argv[2];
if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) {
  console.error('Usage : node scripts/generate-keys.mjs <client-id>   (lettres, chiffres, - _ . uniquement)');
  process.exit(1);
}

mkdirSync('keys', { recursive: true });
const keyPath = `keys/${id}.key`;
const jwkPath = `keys/${id}.jwk.json`;
if (existsSync(keyPath) || existsSync(jwkPath)) {
  console.error('Des fichiers existent déjà pour cet identifiant : je n’écrase rien.');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), use: 'sig', alg: 'RS256', kid: id };

writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
writeFileSync(jwkPath, `${JSON.stringify(jwk, null, 2)}\n`);

console.log(`Clé privée  : ${keyPath}   (SECRÈTE : ne l'envoie à personne, ne la commite pas)`);
console.log(`Clé publique: ${jwkPath}   (c'est ce fichier-là que tu joins au mail à api@evkx.net)`);
