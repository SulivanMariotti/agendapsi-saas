// Alias de compatibilidade: alguns fluxos antigos chamavam /api/attendance/confirmd
// Mantemos o path sem duplicar lógica.

export { GET } from "../confirmed/route";
export const runtime = "nodejs";
