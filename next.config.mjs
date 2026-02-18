/** @type {import('next').NextConfig} */

// Security headers
// - Em produção: CSP ENFORCE (Content-Security-Policy)
// - Em desenvolvimento: CSP Report-Only (para evitar quebra por eval/hot-reload)
const IS_PROD = process.env.NODE_ENV === 'production';

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  // Next em dev usa eval; em prod evitamos.
  IS_PROD
    ? "script-src 'self' 'unsafe-inline' https:"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
  // Firebase/FCM/Firestore + WebSockets
  "connect-src 'self' https: wss:",
  "frame-src 'self' https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // mixed-content
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
  // CSP
  {
    key: IS_PROD
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only',
    value: CONTENT_SECURITY_POLICY,
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
