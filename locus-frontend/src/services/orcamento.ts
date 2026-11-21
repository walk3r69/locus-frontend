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
    "A gravação do orçamento ainda não está disponível nesta tela.",
  );
}
