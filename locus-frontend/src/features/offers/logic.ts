import type { Snapshot } from "@/types";

export type ClassePreco = "boa-oportunidade" | "normal" | "elevado" | "historico-insuficiente";

/** Classifies a price only when there are at least 5 comparable snapshots. */
export function classificarPreco(preco: number, historico: Snapshot[]): ClassePreco {
  if (historico.length < 5) return "historico-insuficiente";
  const precos = historico.map((h) => h.preco);
  const media = precos.reduce((a, b) => a + b, 0) / precos.length;
  if (preco <= media * 0.9) return "boa-oportunidade";
  if (preco >= media * 1.1) return "elevado";
  return "normal";
}
