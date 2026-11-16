import type { ItemOrcamento, Viagem, CategoriaOrcamento, ModoOrcamento } from "@/types";

export async function salvarOrcamento(
  _viagemId: string,
  _dados: {
    itens: ItemOrcamento[];
    limites: Record<CategoriaOrcamento, number>;
    modo: ModoOrcamento;
  },
): Promise<Viagem> {
  throw new Error(
    "Use /api/itens-orcamento e /api/limites-orcamento para persistir o orçamento no backend.",
  );
}
