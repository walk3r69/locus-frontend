import type { Relatorio, Reserva } from "@/types";
import { api, chamar } from "./api";
import { backendUserId } from "./usuarioBackend";

function normalizarRelatorio(raw: Record<string, unknown>, viagemId: string): Relatorio {
  return {
    id: String(raw["id"] ?? ""),
    reservaId: String(raw["reservaId"] ?? ""),
    viagemId,
    protocolo: String(raw["protocoloReserva"] ?? raw["protocolo"] ?? ""),
    geradoEm: String(raw["dataGeracao"] ?? raw["geradoEm"] ?? ""),
    ...(String(raw["nomeArquivo"] ?? "") ? { nomeArquivo: String(raw["nomeArquivo"]) } : {}),
  };
}

export async function listarRelatorios(viagemId?: string): Promise<Relatorio[]> {
  if (!viagemId) return [];
  const reservas = await chamar<Reserva[]>(() =>
    api.get(`/api/reservas-simuladas/viagem/${viagemId}`, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  const relatorios = await Promise.all(
    reservas.map((reserva) =>
      chamar<Record<string, unknown>>(() =>
        api.get(`/api/relatorios/reserva/${reserva.id}`, {
          params: { usuarioSolicitanteId: backendUserId() },
        }),
      )
        .then((raw) => normalizarRelatorio(raw, viagemId))
        .catch(() => null),
    ),
  );
  return relatorios.filter((item): item is Relatorio => Boolean(item));
}

export async function gerarRelatorio(reserva: Reserva): Promise<Relatorio> {
  const raw = await chamar<Record<string, unknown>>(() =>
    api.post(`/api/relatorios/reserva/${reserva.id}`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  const viagem = (reserva as unknown as Record<string, unknown>)["viagem"] as
    Record<string, unknown> | undefined;
  return normalizarRelatorio(raw, reserva.viagemId || String(viagem?.["id"] ?? ""));
}

export async function baixarRelatorio(rel: Relatorio): Promise<Blob> {
  const { data } = await api.get<Blob>(`/api/relatorios/${rel.id}/pdf`, {
    responseType: "blob",
    params: { usuarioSolicitanteId: backendUserId() },
  });
  return data;
}
