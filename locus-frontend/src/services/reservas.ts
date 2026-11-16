import type { Reserva } from "@/types";
import { api, chamar } from "./api";
import { backendUserId } from "./usuarioBackend";

export async function listarReservas(viagemId?: string): Promise<Reserva[]> {
  if (!viagemId) return [];
  return chamar(() =>
    api.get<Reserva[]>(`/api/reservas-simuladas/viagem/${viagemId}`, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
}

export async function cancelarSimulacao(reservaId: string): Promise<void> {
  await chamar(() =>
    api.post(`/api/reservas-simuladas/${reservaId}/cancelar`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
}

export async function confirmarRoteiro(
  viagemId: string,
  _total: number,
): Promise<{
  reserva: Reserva;
  relatorio: import("@/types").Relatorio;
}> {
  const criada = await chamar<Reserva>(() =>
    api.post(`/api/reservas-simuladas/viagem/${viagemId}`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  const preparada = await chamar<Reserva>(() =>
    api.post(`/api/reservas-simuladas/${criada.id}/preparar-pagamento`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  const pagamento = await chamar<{ id: number }>(() =>
    api.post(`/api/pagamentos-simulados/reserva/${preparada.id}/iniciar`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  await chamar(() =>
    api.post(`/api/pagamentos-simulados/${pagamento.id}/concluir`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  const confirmada = await chamar<Reserva>(() =>
    api.post(`/api/reservas-simuladas/${preparada.id}/confirmar`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  const { gerarRelatorio } = await import("./relatorios");
  return { reserva: confirmada, relatorio: await gerarRelatorio(confirmada) };
}
