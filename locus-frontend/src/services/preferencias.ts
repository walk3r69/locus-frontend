import type { Preferencias, Transporte } from "@/types";
import { api, chamar } from "./api";
import { backendUserId } from "./usuarioBackend";

type Json = Record<string, unknown>;

const vazio: Preferencias = {
  idade: undefined,
  origem: "",
  destino: "",
  dataInicio: "",
  dataFim: "",
  transporte: "aviao",
  interesses: [],
  mobilidade: "sem-restricao",
  ritmo: "equilibrado",
  hospedagem: "hotel",
  modoOrcamento: "aberto",
  limites: { passagem: 0, hospedagem: 0, visitas: 0, alimentacao: 0, transporteLocal: 0, extras: 0 },
};

const texto = (value: unknown) => (typeof value === "string" ? value : "");
function transporte(value: unknown): Transporte {
  const mapa: Record<string, Transporte> = { AVIAO: "aviao", ONIBUS: "onibus", CARRO: "carro", MOTOCICLETA: "moto", VEICULO_PARTICULAR: "particular" };
  return mapa[String(value ?? "").toUpperCase()] ?? "aviao";
}
function modoOrcamento(value: unknown): Preferencias["modoOrcamento"] {
  return String(value ?? "").toUpperCase() === "FIXO" ? "fixo" : "aberto";
}

export async function lerPreferenciasBackend(): Promise<Preferencias> {
  const usuarioId = backendUserId();
  const perfil = await chamar<Json>(() => api.get(`/api/perfis/usuario/${usuarioId}`, { params: { usuarioSolicitanteId: usuarioId } }));
  const perfilId = Number(perfil.id);
  const [viagem, transportePreferido] = await Promise.all([
    chamar<Json>(() => api.get(`/api/preferencias-viagem/perfil/${perfilId}`, { params: { usuarioSolicitanteId: usuarioId } })).catch(() => ({})),
    chamar<Json>(() => api.get(`/api/preferencias-transporte/perfil/${perfilId}`, { params: { usuarioSolicitanteId: usuarioId } })).catch(() => ({})),
  ]);
  return {
    ...vazio,
    idade: Number(perfil.idade) || undefined,
    ritmo: (texto(perfil.ritmoViagem) as Preferencias["ritmo"]) || vazio.ritmo,
    interesses: texto(perfil.interesses).split(",").map((item) => item.trim()).filter(Boolean),
    mobilidade: (texto(perfil.mobilidade) as Preferencias["mobilidade"]) || vazio.mobilidade,
    hospedagem: (texto(perfil.preferenciaHospedagem) as Preferencias["hospedagem"]) || vazio.hospedagem,
    origem: texto(viagem.origemPreferida),
    destino: texto(viagem.destinoPreferido),
    modoOrcamento: modoOrcamento(viagem.tipoOrcamento),
    limites: { ...vazio.limites, extras: Number(viagem.valorOrcamento) || 0 },
    transporte: transporte(transportePreferido.modoTransporte),
  };
}

export async function salvarPreferenciasBackend(preferencias: Preferencias): Promise<void> {
  const usuarioId = backendUserId();
  const perfil = await chamar<Json>(() => api.put(`/api/perfis/usuario/${usuarioId}`, {
    idade: preferencias.idade || 18,
    ritmoViagem: preferencias.ritmo,
    interesses: preferencias.interesses.join(", ") || "geral",
    mobilidade: preferencias.mobilidade,
    preferenciaHospedagem: preferencias.hospedagem,
  }, { params: { usuarioSolicitanteId: usuarioId } }));
  const perfilId = Number(perfil.id);
  await Promise.all([
    chamar(() => api.put(`/api/preferencias-viagem/perfil/${perfilId}`, {
      origemPreferida: preferencias.origem,
      destinoPreferido: preferencias.destino,
      tipoOrcamento: preferencias.modoOrcamento === "fixo" ? "FIXO" : "ABERTO",
      valorOrcamento: preferencias.modoOrcamento === "fixo" ? Number(preferencias.limites.extras || 0) : null,
    }, { params: { usuarioSolicitanteId: usuarioId } })),
    chamar(() => api.put(`/api/preferencias-transporte/perfil/${perfilId}`, {
      modoTransporte: { aviao: "AVIAO", onibus: "ONIBUS", carro: "CARRO", moto: "MOTOCICLETA", particular: "VEICULO_PARTICULAR" }[preferencias.transporte],
      prioridade: "INDIFERENTE",
    }, { params: { usuarioSolicitanteId: usuarioId } })),
  ]);
}
