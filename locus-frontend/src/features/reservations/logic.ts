import type { Reserva } from "@/types";

/**
 * Repeating a confirmation with the same idempotency key returns the existing reservation
 * instead of creating a second simulated booking.
 */
export function confirmarIdempotente(
  existentes: Reserva[],
  nova: Omit<Reserva, "status" | "protocolo" | "criadaEm">,
  gerarProtocolo: () => string,
): { reserva: Reserva; repetida: boolean } {
  const ja = existentes.find((r) => r.chaveIdempotencia === nova.chaveIdempotencia);
  if (ja) return { reserva: ja, repetida: true };
  return {
    reserva: {
      ...nova,
      status: "confirmada-simulacao",
      protocolo: gerarProtocolo(),
      criadaEm: new Date().toISOString(),
    },
    repetida: false,
  };
}

export const ROTULO_STATUS: Record<Reserva["status"], string> = {
  rascunho: "Rascunho",
  "aguardando-pagamento": "Aguardando pagamento",
  concluida: "Concluída",
  "confirmada-simulacao": "Confirmada em simulação",
  "cancelada-simulacao": "Cancelada em simulação",
};
