/**
 * Puerto de protección de datos sensibles. La aplicación depende de esta interfaz;
 * la implementación concreta (regex hoy, Presidio mañana) vive en infraestructura.
 */
export interface RedactionResult {
  text: string;
  findings: string[];
  secretDetected: boolean;
}

export interface SensitiveDataPort {
  redact(text: string): RedactionResult;
  containsSensitive(text: string): boolean;
  /** Identificador estable y no reversible para un usuario (usr_xxxxxxxxxxxx). */
  pseudonymize(userId: string): string;
  /** Busca el usuario afectado en el texto original y lo devuelve seudonimizado. */
  extractAffectedUserRef(text: string, fallbackUserId?: string): string | null;
}
