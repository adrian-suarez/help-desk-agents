/** Abstraer el reloj permite probar SLA y vencimientos sin depender de la hora real. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
