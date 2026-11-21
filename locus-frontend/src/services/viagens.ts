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

function categoriaOrcamento(value: unknown): CategoriaOrcamento {
  const normalizada = String(value ?? "EXTRAS").toUpperCase();
  return ({
    PASSAGEM: "passagem",
    HOSPEDAGEM: "hospedagem",
    VISITAS: "visitas",
    ALIMENTACAO: "alimentacao",
    TRANSPORTE_LOCAL: "transporteLocal",
    EXTRAS: "extras",
  } as Record<string, CategoriaOrcamento>)[normalizada] ?? "extras";
}

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
    modoOrcamento: String(raw["tipoOrcamento"] ?? "").toUpperCase() === "FIXO" ? "fixo" : "aberto",
    mochilao: Boolean(raw["mochilao"]),
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
      ...(Number(item["custoEstimado"] ?? 0) > 0
        ? { valorEstimado: Number(item["custoEstimado"]) }
        : {}),
      ...(String(item["fonteValor"] ?? "")
        ? { fonteValor: String(item["fonteValor"]) }
        : {}),
      ...(String(item["observacoes"] ?? "") ? { observacoes: String(item["observacoes"]) } : {}),
      favorito: Boolean(item["favorito"]),
      ...(String(item["motivoRecomendacao"] ?? "")
        ? { motivo: String(item["motivoRecomendacao"]) }
        : {}),
    })),
  );

  const itensOrcamento: ItemOrcamento[] = orcamento.map((item) => ({
    id: String(item["id"] ?? ""),
    categoria: categoriaOrcamento(item["categoria"]),
    descricao: String(item["descricao"] ?? ""),
    valor: Number(item["valor"] ?? 0),
    natureza: String(item["fonte"] ?? "ESTIMADO").toLowerCase() as ItemOrcamento["natureza"],
  }));
  const limitesMap = limites.reduce<Record<CategoriaOrcamento, number>>((acc, item) => {
    const categoria = categoriaOrcamento(item["categoria"]);
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
    | "mochilao"
  >,
): Promise<Viagem> {
  const criada = await chamar<Record<string, unknown>>(() =>
    api.post(
      `/api/viagens/usuario/${backendUserId()}`,
      {
        titulo: dados.titulo,
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
        tipoOrcamento: dados.modoOrcamento === "fixo" ? "FIXO" : "ABERTO",
        mochilao: Boolean(dados.mochilao),
      },
      { params: { usuarioSolicitanteId: backendUserId() } },
    ),
  );
  if (dados.modoOrcamento === "fixo" && Number(dados.limites.extras || 0) > 0) {
    await chamar(() =>
      api.post(
        `/api/limites-orcamento/viagem/${criada.id}`,
        { categoria: "EXTRAS", valorLimite: Number(dados.limites.extras) },
        { params: { usuarioSolicitanteId: backendUserId() } },
      ),
    );
  }
  return hidratar(criada);
}

export async function atualizarViagem(_id: string, _parcial: Partial<Viagem>): Promise<Viagem> {
  throw new Error("A atualização parcial da viagem ainda não está disponível.");
}

export async function salvarPreferencias(_p: Preferencias): Promise<void> {
  throw new Error("A gravação das preferências ainda não está disponível.");
}

export async function lerPreferencias(): Promise<Preferencias | null> {
  return null;
}

export async function listarNotificacoes(): Promise<Notificacao[]> {
  const lista = await chamar<Array<Record<string, unknown>>>(() =>
    api.get<Array<Record<string, unknown>>>(`/api/notificacoes/usuario/${backendUserId()}`, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
  return lista.map((item) => ({
    id: String(item["id"] ?? ""),
    titulo: String(item["titulo"] ?? "Atualização do Locus"),
    texto: String(item["mensagem"] ?? item["texto"] ?? ""),
    tipo: String(item["tipo"] ?? "GERAL"),
    lida: Boolean(item["lida"]),
    criadaEm: String(item["dataCriacao"] ?? item["criadaEm"] ?? ""),
  }));
}

export async function marcarLida(id: string): Promise<void> {
  await chamar(() =>
    api.put(`/api/notificacoes/${id}/ler`, undefined, {
      params: { usuarioId: backendUserId(), usuarioSolicitanteId: backendUserId() },
    }),
  );
}

export async function marcarTodasComoLidas(): Promise<void> {
  await chamar(() =>
    api.put(`/api/notificacoes/usuario/${backendUserId()}/ler-todas`, undefined, {
      params: { usuarioSolicitanteId: backendUserId() },
    }),
  );
}
