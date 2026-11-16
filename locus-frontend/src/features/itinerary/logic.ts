import type { ItemRoteiro } from "@/types";

export const paraMinutos = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Returns ids of items whose block (travel + margin + duration) overlaps the next one on the same day. */
export function conflitosDeHorario(itens: ItemRoteiro[]): Set<string> {
  const conflitos = new Set<string>();
  const porDia = new Map<number, ItemRoteiro[]>();
  itens.forEach((i) => porDia.set(i.dia, [...(porDia.get(i.dia) ?? []), i]));
  porDia.forEach((lista) => {
    const ord = [...lista].sort((a, b) => paraMinutos(a.inicio) - paraMinutos(b.inicio));
    for (let k = 0; k < ord.length - 1; k++) {
      const atual = ord[k]!;
      const prox = ord[k + 1]!;
      const fim = paraMinutos(atual.inicio) + atual.duracaoMin;
      const chegadaNecessaria = fim + prox.deslocamentoMin + prox.margemMin;
      if (chegadaNecessaria > paraMinutos(prox.inicio)) {
        conflitos.add(atual.id);
        conflitos.add(prox.id);
      }
    }
  });
  return conflitos;
}

export function mover(itens: ItemRoteiro[], id: string, direcao: -1 | 1): ItemRoteiro[] {
  const idx = itens.findIndex((i) => i.id === id);
  const alvo = idx + direcao;
  if (idx < 0 || alvo < 0 || alvo >= itens.length || itens[alvo]!.dia !== itens[idx]!.dia)
    return itens;
  const copia = [...itens];
  [copia[idx], copia[alvo]] = [copia[alvo]!, copia[idx]!];
  return copia;
}

export function duplicar(itens: ItemRoteiro[], id: string, novoId: string): ItemRoteiro[] {
  const idx = itens.findIndex((i) => i.id === id);
  if (idx < 0) return itens;
  const copia = [...itens];
  copia.splice(idx + 1, 0, { ...itens[idx]!, id: novoId, titulo: itens[idx]!.titulo + " (cópia)" });
  return copia;
}
