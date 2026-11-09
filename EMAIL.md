**À :** api@evkx.net
**Pièce jointe :** keys/calculateur-recharge-ev.jwk.json (clé publique uniquement, jamais le .key)
**Objet :** API access request – free EV charging-time calculator (client id: calculateur-recharge-ev)

Hello EVKX team,

I'm Jessica, a freelance front-end developer based in France (portfolio: jessica-lemarchand.vercel.app). I'm building a small, free web tool that estimates how long an electric car takes to charge, and what it costs, for a chosen battery range, charger power and electricity price.

I would like to request partner access to the External API:

1. Proposed client id: calculateur-recharge-ev
2. Public key: the attached JWK (calculateur-recharge-ev.jwk.json). The private key stays on my side.
3. Scopes: evkx:external:search and evkx:external:battery
4. Use case: today the tool estimates fast-charging time with a simplified curve. With your measured charge curves it can give realistic times (the slowdown above 80%) for the car the user picks. Calls are made server-side only, on demand for the one vehicle selected, and responses are cached for at least 24 hours, so the load on your API stays very low. I do not export or republish the catalog, and EVKX.net is credited wherever your data is shown. Traffic will be small at the start, and I will respect any rate limits you set.

One point of transparency: the tool is free today, but I may later add light monetization (affiliate links or ads). Please tell me whether that fits your terms or calls for a different arrangement.

Thank you for your time, and for the clear onboarding guide.

Best regards,
Jessica
Freelance front-end developer
jessica-lemarchand.vercel.app
