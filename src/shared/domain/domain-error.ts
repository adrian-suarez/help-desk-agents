/**
 * Error de negocio. Su `code` es estable y el agente lo usa para decidir qué hacer
 * (por ejemplo, escalar ante NOT_VERIFIED). El mensaje es legible para humanos.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} ${id} no existe`);
  }
}
