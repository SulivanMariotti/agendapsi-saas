import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const ENV_GLOB_PREFIXES = ['.env', '.env.'];
const ALLOWLIST = new Set(['.env.example']);

const SUSPICIOUS_PATTERNS = [
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /"private_key"\s*:\s*"/,
  /FIREBASE_ADMIN_SERVICE_ACCOUNT/i,
  /service_account/i,
  /CRON_SECRET\s*=\s*.+/i,
  /ADMIN_PASSWORD\s*=\s*.+/i,
];

function isEnvFile(name) {
  if (ALLOWLIST.has(name)) return false;
  return ENV_GLOB_PREFIXES.some((p) => name === p || name.startsWith(p));
}

function readTextSafe(fp) {
  try {
    return fs.readFileSync(fp, 'utf8');
  } catch {
    return null;
  }
}

function main() {
  const rootEntries = fs.readdirSync(ROOT, { withFileTypes: true });

  const findings = [];

  // 1) env files at repo root
  for (const e of rootEntries) {
    if (!e.isFile()) continue;
    if (isEnvFile(e.name)) {
      findings.push({
        type: 'ENV_FILE',
        file: e.name,
        message:
          'Arquivo .env* encontrado no root. Não versionar e não enviar em zip. Use .env.example como template.',
      });
    }
  }

  // 2) quick scan for obvious private keys inside common text files
  const scanTargets = ['README.md', 'chave-base.txt'];
  for (const name of scanTargets) {
    const fp = path.join(ROOT, name);
    if (!fs.existsSync(fp)) continue;
    const txt = readTextSafe(fp);
    if (!txt) continue;
    for (const re of SUSPICIOUS_PATTERNS) {
      if (re.test(txt)) {
        findings.push({
          type: 'SUSPICIOUS_CONTENT',
          file: name,
          message:
            'Possível conteúdo sensível detectado. Remova/mascare antes de compartilhar ou versionar.',
          pattern: String(re),
        });
        break;
      }
    }
  }

  if (findings.length === 0) {
    console.log('✅ Security check: nenhum segredo óbvio encontrado no root.');
    process.exit(0);
  }

  console.log('⚠️  Security check: achados que podem bloquear produção/compartilhamento:');
  for (const f of findings) {
    console.log(`- [${f.type}] ${f.file}: ${f.message}${f.pattern ? ` (${f.pattern})` : ''}`);
  }

  // Não “quebra” build automaticamente; mas falha o check para forçar ação antes de release.
  process.exit(1);
}

main();
