# Temps de recharge : projet Vercel

Calculateur de temps et de coût de recharge d'une voiture électrique.
Le site est un simple `index.html` (aucune étape de build) ; le dossier `api/` contient des fonctions
serveur Vercel qui parlent à l'**API EVKX** pour récupérer les courbes de charge mesurées.

> Sans clé EVKX, tout fonctionne quand même : le site utilise les courbes d'Open EV Data.
> L'API EVKX est une amélioration optionnelle (elle remplace la courbe par une courbe mesurée).

## Pourquoi un serveur ?

L'API EVKX n'utilise pas une simple clé à copier : elle s'authentifie avec une **clé privée RSA** qui signe
une assertion JWT. Cette clé ne doit jamais se retrouver dans le navigateur, donc les appels passent par
`api/evkx/*` côté serveur. Les réponses sont mises en cache 24 h par le CDN de Vercel pour ménager le quota.

## Mise en route

Prérequis : Node 20 ou plus récent.

1. **Choisis ton identifiant client** (lettres, chiffres, `-`, `_`, `.`), par exemple `calculateur-recharge-ev`.
   Il est inscrit dans la clé : choisis-le avant de la générer.
2. **Génère les clés** : `npm run keys -- calculateur-recharge-ev`
   - `keys/<id>.key` : clé **privée**. Secrète, ne la partage ni ne la commite jamais.
   - `keys/<id>.jwk.json` : clé **publique**. C'est ce fichier que tu joins au mail.
3. **Envoie le mail** à `api@evkx.net` (texte prêt dans `EMAIL.md`) avec le `.jwk.json` en pièce jointe.
   Rien n'est actif tant qu'EVKX n'a pas confirmé l'inscription (avant, l'échange de jeton répond `401 Unknown client`).
4. **Test local** après confirmation : copie `.env.example` en `.env`, renseigne `EVKX_CLIENT_ID` et
   `EVKX_PRIVATE_KEY`, puis `npm run check:evkx`. Le script affiche le jeton, une recherche, la réponse brute
   de `/battery` et ce que `api/_curve.js` en comprend.
5. **Déploie sur Vercel** (import du dépôt GitHub, preset « Other », pas de commande de build).
   Ajoute les variables d'environnement `EVKX_CLIENT_ID` et `EVKX_PRIVATE_KEY` (colle le PEM tel quel).
6. **Vérifie** : `https://ton-site.vercel.app/api/evkx/status` doit répondre `{"enabled":true}`.

## Tests

`npm test` lance un faux serveur EVKX qui vérifie la signature RS256 comme le vrai, puis exerce les fonctions
(jeton mis en cache, jeton révoqué, entrées invalides, choix de la bonne batterie…). Aucun réseau nécessaire.

## Points à connaître

- **Format des courbes à valider.** La doc publique d'EVKX décrit l'enveloppe de `/ev/{id}/battery`
  (`netCapacityKwh`, `chargeCurves`) mais pas le détail des points. `api/_curve.js` accepte plusieurs noms de
  champs probables et renvoie « rien » s'il ne reconnaît pas la réponse (le site garde alors Open EV Data).
  Une fois la clé active, regarde la sortie de `npm run check:evkx` et ajuste `pointsOf()` si besoin.
- **Micra.** Sa courbe est embarquée dans `index.html` (reconstruite à partir des relevés publics EVKX,
  repérée par `"r":1`). Dès que l'API répond, elle est remplacée par la courbe officielle.
- **Attribution.** Le pied de page cite EVKX.net. Garde-le, c'est une condition de leur accès. Pas de copie
  massive du catalogue : les appels se font à la demande, véhicule par véhicule.
- **Vercel Hobby = usage non commercial.** Pubs, liens d'affiliation et dons demandent le plan Pro
  (ou un autre hébergeur qui autorise l'usage commercial gratuit, comme Netlify ou Cloudflare Pages).
  EVKX demande aussi de lui signaler un éventuel usage commercial : c'est dans le mail.

## Structure

```
index.html            le site (tout le calcul est côté navigateur)
api/_evkx.js          signature de l'assertion, échange de jeton, cache, garde-fou de débit
api/_curve.js         lecture des courbes de charge EVKX
api/evkx/status.js    le site demande si l'API est branchée
api/evkx/curve.js     courbe mesurée d'un véhicule (utilisé par le site)
api/evkx/search.js    relais de /ev/search  (pour inspecter)
api/evkx/battery.js   relais de /ev/{id}/battery  (pour inspecter)
scripts/              génération des clés, vérification, tests
```
