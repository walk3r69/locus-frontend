import type {
  Viagem,
  Preferencias,
  Notificacao,
  ItemRoteiro,
  ItemOrcamento,
  CategoriaOrcamento,
} from "@/types";
import { api, chamar } from "./api";
import { backendUserId } from "./usuarioBackend";

const categorias: CategoriaOrcamento[] = [
  "passagem",
  "hospedagem",
  "visitas",
  "alimentacao",
  "transporteLocal",
  "extras",
];

const limitesVazios = (): Record<CategoriaOrcamento, number> => ({
  passagem: 0,
  hospedagem: 0,
  visitas: 0,
  alimentacao: 0,
  transporteLocal: 0,
  extras: 0,
});

function transporte(modo: unknown): Viagem["transporte"] {
  const value = String(modo ?? "").toUpperCase();
  return (
    (
      {
        AVIAO: "aviao",
        ONIBUS: "onibus",
        CARRO: "carro",
        MOTOCICLETA: "moto",
        VEICULO_PARTICULAR: "particular",
      } as Record<string, Viagem["transporte"]>
    )[value] ?? "aviao"
  );
}

async function hidratar(raw: Record<string, unknown>): Promise<Viagem> {
  const id = String(raw["id"] ?? "");
  const userId = backendUserId();
  const base: Viagem = {
    id,
    titulo: `Roteiro para ${String(raw["destino"] ?? "sua próxima viagem")}`,
    origem: String(raw["origem"] ?? ""),
    destino: String(raw["destino"] ?? ""),
    dataInicio: String(raw["dataInicio"] ?? ""),
    dataFim: String(raw["dataFim"] ?? ""),
    transporte: transporte(raw["modoTransporte"]),
    modoOrcamento: "aberto",
    limites: limitesVazios(),
    roteiro: [],
    versoes: [],
    orcamento: [],
    colaboradores: [],
    tokenCompartilhamento: "",
  };

  const [dias, orcamento, limites] = await Promise.all([
    chamar<Array<Record<string, unknown>>>(() =>
      api.get(`/api/dias-roteiro/viagem/${id}`, { params: { usuarioId: userId } }),
    ).catch(() => []),
    chamar<Array<Record<string, unknown>>>(() =>
      api.get(`/api/itens-orcamento/viagem/${id}`, { params: { usuarioSolicitanteId: userId } }),
    ).catch(() => []),
    chamar<Array<Record<string, unknown>>>(() =>
      api.get(`/api/limites-orcamento/viagem/${id}`, { params: { usuarioSolicitanteId: userId } }),
    ).catch(() => []),
  ]);

  const itensPorDia = await Promise.all(
    dias.map((dia) =>
      chamar<Array<Record<string, unknown>>>(() =>
        api.get(`/api/itens-roteiro/dia/${dia["id"]}`, { params: { usuarioId: userId } }),
      ).catch(() => []),
    ),
  );

  const roteiro: ItemRoteiro[] = itensPorDia.flatMap((itens, diaIndex) =>
    itens.map((item) => ({
      id: String(item["id"] ?? ""),
      dia: diaIndex + 1,
      titulo: String(item["titulo"] ?? "Atividade"),
      inicio: String(item["horarioInicio"] ?? "09:00").slice(0, 5),
      duracaoMin: Number(item["duracaoMinutos"] ?? 60),
      deslocamentoMin: 0,
      margemMin: 15,
      ...(String(item["observacoes"] ?? "") ? { observacoes: String(item["observacoes"]) } : {}),
      favorito: Boolean(item["favorito"]),
      ...(String(item["motivoRecomendacao"] ?? "")
        ? { motivo: String(item["motivoRecomendacao"]) }
        : {}),
    })),
  );

  const itensOrcamento: ItemOrcamento[] = orcamento.map((item) => ({
    id: String(item["id"] ?? ""),
    categoria: String(item["categoria"] ?? "extras") as CategoriaOrcamento,
    descricao: String(item["descricao"] ?? ""),
    valor: Number(item["valor"] ?? 0),
    natureza: String(item["fonte"] ?? "ESTIMADO").toLowerCase() as ItemOrcamento["natureza"],
  }));
  const limitesMap = limites.reduce<Record<CategoriaOrcamento, number>>((acc, item) => {
    const categoria = String(item["categoria"] ?? "extras") as CategoriaOrcamento;
    if (categorias.includes(categoria)) acc[categoria] = Number(item["valorLimite"] ?? 0);
    return acc;
  }, limitesVazios());

  return { ...base, roteiro, orcamento: itensOrcamento, limites: limitesMap };
}

export async function listarViagens(): Promise<Viagem[]> {
  const viagens = await chamar<Array<Record<string, unknown>>>(() =>
    api.get(`/api/viagens/usuario/${backendUserId()}`, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  return Promise.all(viagens.map(hidratar));
}

export async function obterViagem(id: string): Promise<Viagem> {
  const raw = await chamar<Record<string, unknown>>(() =>
    api.get(`/api/viagens/${id}`, { params: { usuarioSolicitanteId: backendUserId() } }),
  );
  return hidratar(raw);
}

export async function obterCompartilhada(token: string): Promise<Viagem> {
  return chamar(() =>
    api.get<Viagem>(`/api/links-compartilhamento/acesso/${encodeURIComponent(token)}/viagem`),
  );
}

export async function criarViagem(
  dados: Pick<
    Viagem,
    | "titulo"
    | "origem"
    | "destino"
    | "dataInicio"
    | "dataFim"
    | "transporte"
    | "modoOrcamento"
    | "limites"
  >,
): Promise<Viagem> {
  const criada = await chamar<Record<string, unknown>>(() =>
    api.post(
      `/api/viagens/usuario/${backendUserId()}`,
      {
        origem: dados.origem,
        destino: dados.destino,
        dataInicio: dados.dataInicio,
        dataFim: dados.dataFim,
        modoTransporte: (
          {
            aviao: "AVIAO",
            onibus: "ONIBUS",
            carro: "CARRO",
            moto: "MOTOCICLETA",
            particular: "VEICULO_PARTICULAR",
          } as Record<string, string>
        )[dados.transporte],
      },
      { params: { usuarioSolicitanteId: backendUserId() } },
    ),
  );
  return hidratar(criada);
}

export async function atualizarViagem(_id: string, _parcial: Partial<Viagem>): Promise<Viagem> {
  throw new Error("O backend ainda não expõe atualização parcial da viagem.");
}

export async function salvarPreferencias(_p: Preferencias): Promise<void> {
  throw new Error("As preferências devem ser persistidas pelos endpoints de perfil do backend.");
}

export async function lerPreferencias(): Promise<Preferencias | null> {
  return null;
}

export async function listarNotificacoes(): Promise<Notificacao[]> {
  return chamar(() =>
    api.get<Notificacao[]>(`/api/notificacoes/usuario/${backendUserId()}`, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
}

export async function marcarLida(id: string): Promise<void> {
  await chamar(() =>
    api.put(`/api/notificacoes/${id}/ler`, undefined, {
      params: { usuarioId: backendUserId(), usuarioSolicitanteId: backendUserId() },
    }),
  );
}
