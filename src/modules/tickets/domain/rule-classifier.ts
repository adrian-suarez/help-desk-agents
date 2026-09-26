import type { Priority, Subtype } from './ticket.constants';

/**
 * Segunda opinión determinista. No clasifica por sí sola: el LLM propone y estas reglas
 * sirven para detectar desacuerdos y para subir (nunca bajar) la prioridad.
 * Si no reconoce nada devuelve subtype = null, y en ese caso se confía en el LLM.
 */
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const PATTERNS: ReadonlyArray<[Subtype, RegExp]> = [
  ['ACCOUNT_LOCKED', /bloquead[ao]|intentos fallidos|demasiados intentos/],
  ['PASSWORD_RESET', /(olvide|restablecer|resetear|recuperar).{0,25}(contrasena|clave|password)|(contrasena|clave).{0,20}(expir|caduc|vencid)/],
  ['MFA_ISSUE', /\bmfa\b|\b2fa\b|doble factor|autenticador|codigo de verificacion/],
  ['ACCOUNT_DISABLED', /deshabilitad|desactivad|inactividad/],
  ['VPN_CONNECTIVITY', /\bvpn\b|forticlient|anyconnect|globalprotect/],
  ['PERFORMANCE', /\blent[oa]s?\b|lentitud|se congela|se cuelga|tarda mucho/],
  ['FOLDER_REPO_ACCESS', /(acceso|permisos?).{0,30}(carpeta|repositorio|repo\b|sharepoint)/],
  ['LICENSE_REQUEST', /licencia/],
  ['PROFILE_CHANGE', /cambio de (perfil|rol|area|cargo)/],
];

const HIGH_IMPACT = /todo el (equipo|area|departamento)|toda la oficina|varios (usuarios|companeros)|nadie puede/;
const HIGH_URGENCY = /urgente|critico|produccion|no puedo trabajar|cierre contable|nomina|caido/;

export interface RuleGuess {
  subtype: Subtype | null;
  /** Solo P1/P2 cuando detecta impacto o urgencia; null si no hay señales. */
  priorityFloor: Priority | null;
}

export function guessByRules(description: string): RuleGuess {
  const text = normalize(description);
  const matches = PATTERNS.filter(([, re]) => re.test(text)).map(([s]) => s);
  const impact = HIGH_IMPACT.test(text);
  const urgency = HIGH_URGENCY.test(text);
  return {
    // Si varias reglas coinciden el texto es mixto: no opinamos sobre el subtipo.
    subtype: matches.length === 1 ? matches[0]! : null,
    priorityFloor: impact && urgency ? 'P1' : impact || urgency ? 'P2' : null,
  };
}
