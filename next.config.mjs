/** @type {import('next').NextConfig} */

// Security headers (produção)
// - CSP está em modo Report-Only para reduzir risco de quebra.
//   Quando validado em produção (sem violações relevantes), trocar para Content-Security-Policy.
const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  // Next em dev usa eval; em prod normalmente não. Mantemos para evitar quebra em builds com tooling.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  // Firebase/FCM/Firestore + WebSockets
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // ajuda a detectar mixed-content (report-only aqui)
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // evita “tabnabbing” e reforça isolamento sem quebrar popups quando necessário
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
  // HTTPS only (Vercel/domínios com TLS)
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  // CSP em modo observação
  {
    key: 'Content-Security-Policy-Report-Only',
    value: CONTENT_SECURITY_POLICY_REPORT_ONLY,
  },
];

const nextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
