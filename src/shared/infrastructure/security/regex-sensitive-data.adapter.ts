import { createHmac } from 'node:crypto';
import type { RedactionResult, SensitiveDataPort } from '../../application/ports/sensitive-data.port';

interface Rule {
  type: string;
  pattern: RegExp;
  secret?: boolean;
  replace?: (match: string, ...groups: string[]) => string;
}

const USERNAME = /\b(usuari[oa]|user(?:name)?|cuenta de)\s+([a-z][a-z0-9._-]{2,})(?![a-záéíóúñ])/gi;
const USERNAME_STOPWORDS = new Set(['bloqueado', 'bloqueada', 'deshabilitado', 'deshabilitada', 'que', 'esta', 'nuevo', 'nueva', 'final', 'corporativo', 'red', 'no']);

/**
 * Orden: primero secretos, luego datos personales. IPs y hostnames no se redactan
 * porque el diagnóstico los necesita.
 */
const RULES: Rule[] = [
  {
    type: 'SECRET',
    // Exige separador ("es", ":" o "=") para no redactar frases como "contraseña bloqueada".
    pattern: /\b(contrase(?:ñ|n)a|password|clave|pin|token|secret|api[_-]?key)(\s+(?:es|era|is)\s+|\s*[:=]\s*)["']?([^\s"',;]{3,})/gi,
    secret: true,
    replace: (_m, key, sep) => `${key}${sep}[REDACTED:SECRET]`,
  },
  { type: 'JWT', pattern: /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, secret: true },
  { type: 'BEARER', pattern: /\bBearer\s+[\w.~+/-]+=*/gi, secret: true },
  { type: 'API_KEY', pattern: /\b(?:sk|pk|ghp|gho|glpat|xox[bap])[-_][\w-]{10,}/g, secret: true },
  { type: 'EMAIL', pattern: /\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/gi },
  { type: 'CARD', pattern: /\b(?:\d[ -]?){13,16}\b/g },
  { type: 'PHONE', pattern: /(?:\+\d{1,3}[\s-]?)?\b\d{3}[\s-]\d{3}[\s-]?\d{3,4}\b/g },
  { type: 'ID_NUMBER', pattern: /\b\d{7,10}\b/g },
  {
    type: 'USERNAME',
    pattern: USERNAME,
    replace: (m, key, user) => (USERNAME_STOPWORDS.has(user.toLowerCase()) ? m : `${key} [REDACTED:USERNAME]`),
  },
];

const SECRET_TYPES = new Set(RULES.filter((r) => r.secret).map((r) => r.type));

export class RegexSensitiveDataAdapter implements SensitiveDataPort {
  constructor(private readonly salt: string) {}

  redact(input: string): RedactionResult {
    let text = input;
    const findings = new Set<string>();
    for (const rule of RULES) {
      text = text.replace(rule.pattern, (...args: unknown[]) => {
        const match = args[0] as string;
        const groups = args.slice(1).filter((a): a is string => typeof a === 'string');
        const replaced = rule.replace ? rule.replace(match, ...groups) : `[REDACTED:${rule.type}]`;
        if (replaced !== match) findings.add(rule.type);
        return replaced;
      });
    }
    const list = [...findings];
    return { text, findings: list, secretDetected: list.some((t) => SECRET_TYPES.has(t)) };
  }

  containsSensitive(text: string): boolean {
    return this.redact(text).findings.length > 0;
  }

  pseudonymize(userId: string): string {
    // HMAC con sal secreta: sin la sal no se puede recalcular ni revertir.
    const digest = createHmac('sha256', this.salt).update(userId.trim().toLowerCase()).digest('hex');
    return `usr_${digest.slice(0, 12)}`;
  }

  extractAffectedUserRef(text: string, fallbackUserId?: string): string | null {
    const email = text.match(/\b([\w.%+-]+)@[\w.-]+\.[a-z]{2,}\b/i);
    if (email?.[1]) return this.pseudonymize(email[1]);
    for (const m of text.matchAll(USERNAME)) {
      const user = m[2];
      if (user && !USERNAME_STOPWORDS.has(user.toLowerCase())) return this.pseudonymize(user);
    }
    return fallbackUserId ? this.pseudonymize(fallbackUserId) : null;
  }
}
