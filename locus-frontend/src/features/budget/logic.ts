import type { CategoriaOrcamento, ItemOrcamento, ModoOrcamento } from "@/types";

export const CATEGORIAS: { id: CategoriaOrcamento; rotulo: string }[] = [
  { id: "passagem", rotulo: "Passagem" },
  { id: "hospedagem", rotulo: "Hospedagem" },
  { id: "visitas", rotulo: "Visitas" },
  { id: "alimentacao", rotulo: "Alimentação" },
  { id: "transporteLocal", rotulo: "Transporte local" },
  { id: "extras", rotulo: "Extras" },
];

export interface ResumoCategoria {
  categoria: CategoriaOrcamento;
  subtotal: number;
  limite: number;
  saldo: number | null;
  excesso: number;
}

export function resumirOrcamento(
  itens: ItemOrcamento[],
  limites: Record<CategoriaOrcamento, number>,
  modo: ModoOrcamento,
) {
  const categorias: ResumoCategoria[] = CATEGORIAS.map(({ id }) => {
    const subtotal = itens.filter((i) => i.categoria === id).reduce((s, i) => s + i.valor, 0);
    const limite = limites[id] ?? 0;
    const saldo = modo === "fixo" ? limite - subtotal : null;
    return {
      categoria: id,
      subtotal,
      limite,
      saldo,
      excesso: modo === "fixo" ? Math.max(0, subtotal - limite) : 0,
    };
  });
  const total = categorias.reduce((s, c) => s + c.subtotal, 0);
  const limiteTotal = categorias.reduce((s, c) => s + c.limite, 0);
  return {
    categorias,
    total,
    limiteTotal,
    saldo: modo === "fixo" ? limiteTotal - total : null,
    excesso: modo === "fixo" ? Math.max(0, total - limiteTotal) : 0,
  };
}

export const brl = (v: number, moeda = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(v);
