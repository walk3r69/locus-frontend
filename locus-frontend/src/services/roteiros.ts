import type { CategoriaOrcamento, ItemRoteiro, Recomendacao, Viagem } from "@/types";
import { api, chamar } from "./api";
import { obterViagem } from "./viagens";
import { backendUserId } from "./usuarioBackend";

function categoriaBackend(categoria: CategoriaOrcamento | undefined): string {
  return ({
    passagem: "PASSAGEM",
    hospedagem: "HOSPEDAGEM",
    visitas: "VISITAS",
    alimentacao: "ALIMENTACAO",
    transporteLocal: "TRANSPORTE_LOCAL",
    extras: "EXTRAS",
  } as Record<string, string>)[String(categoria ?? "visitas")] ?? "VISITAS";
}

export async function salvarRoteiro(_viagemId: string, _itens: ItemRoteiro[]): Promise<Viagem> {
  throw new Error("Use os endpoints de dias e itens de roteiro para persistir as atividades.");
}

export async function criarVersao(viagemId: string): Promise<Viagem> {
  return chamar<Viagem>(() =>
    api.post<Viagem>(`/api/versoes-roteiro/viagem/${viagemId}`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
}

export async function criarRoteiroInicial(viagem: Viagem): Promise<Viagem> {
  const inicio = new Date(`${viagem.dataInicio}T12:00:00`);
  const fim = new Date(`${viagem.dataFim || viagem.dataInicio}T12:00:00`);
  const datas: string[] = [];
  for (let data = new Date(inicio); data <= fim && datas.length < 90; data.setDate(data.getDate() + 1)) {
    datas.push(data.toISOString().slice(0, 10));
  }
  await Promise.all(
    (datas.length ? datas : [viagem.dataInicio]).map((data) =>
      chamar<{ id: number }>(() =>
        api.post(
          `/api/dias-roteiro/viagem/${viagem.id}`,
          { data },
          { params: { usuarioId: backendUserId() } },
        ),
      ),
    ),
  );
  return {
    ...viagem,
    roteiro: [],
  };
}

export async function adicionarRecomendacao(
  viagemId: string,
  recomendacao: Recomendacao,
): Promise<Viagem> {
  const usuarioId = backendUserId();
  const valor = Number(recomendacao.valor ?? 0);
  const possuiValor = Number.isFinite(valor) && valor > 0;
  const ehOferta = recomendacao.tipo === "voo" || recomendacao.tipo === "hospedagem";
  if (!ehOferta) {
    const dias = await chamar<Array<{ id: number }>>(() =>
      api.get(`/api/dias-roteiro/viagem/${viagemId}`, { params: { usuarioId } }),
    );
    const dia = dias[Math.max(0, Math.min(dias.length - 1, (recomendacao.dia ?? 1) - 1))] ?? (await criarDia(viagemId));
    const itens = await chamar<Array<{ horarioInicio?: string; duracaoMinutos?: number }>>(() =>
      api.get(`/api/itens-roteiro/dia/${dia.id}`, { params: { usuarioId } }),
    );
    const fimMaisTarde = itens.reduce((maior, item) => {
      const [hora, minuto] = String(item.horarioInicio ?? "09:00").split(":").map(Number);
      const fim = (hora || 0) * 60 + (minuto || 0) + Number(item.duracaoMinutos ?? 60);
      return Math.max(maior, fim);
    }, 9 * 60);
    const inicio = itens.length ? fimMaisTarde + 30 : 10 * 60;
    const horarioInicio = `${String(Math.floor(inicio / 60)).padStart(2, "0")}:${String(inicio % 60).padStart(2, "0")}`;
    await chamar(() =>
      api.post(
        `/api/itens-roteiro/dia/${dia.id}`,
        {
          titulo: recomendacao.titulo,
          horarioInicio,
          duracaoMinutos: recomendacao.duracaoMinutos ?? 90,
          custoEstimado: 0,
          observacoes: recomendacao.resumo,
          motivoRecomendacao: recomendacao.justificativa,
        },
        { params: { usuarioId } },
      ),
    );
  }
  if (possuiValor) {
    await chamar(() =>
      api.post(
        `/api/itens-orcamento/viagem/${viagemId}`,
        {
          categoria: categoriaBackend(recomendacao.categoria),
          descricao: recomendacao.titulo,
          valor,
        },
        { params: { usuarioSolicitanteId: usuarioId } },
      ),
    );
  }
  return obterViagem(viagemId);
}

async function criarDia(viagemId: string): Promise<{ id: number }> {
  const viagem = await obterViagem(viagemId);
  return chamar<{ id: number }>(() =>
    api.post(
      `/api/dias-roteiro/viagem/${viagemId}`,
      { data: viagem.dataInicio },
      { params: { usuarioId: backendUserId() } },
    ),
  );
}

export async function restaurarVersao(_viagemId: string, versaoId: string): Promise<Viagem> {
  throw new Error(
    `A versão ${versaoId} não pode ser restaurada automaticamente; compare e recrie os itens desejados.`,
  );
}

export { obterViagem };
