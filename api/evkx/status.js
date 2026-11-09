// Indique au site si l'API EVKX est branchée (sans rien révéler des secrets).
import { isConfigured } from '../_evkx.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=300');
  return res.status(200).json({ enabled: isConfigured() });
}
