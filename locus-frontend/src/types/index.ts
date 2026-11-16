export type Transporte = "aviao" | "onibus" | "carro" | "moto" | "particular";
export type ModoOrcamento = "fixo" | "aberto";
export type CategoriaOrcamento =
  "passagem" | "hospedagem" | "visitas" | "alimentacao" | "transporteLocal" | "extras";
export type NaturezaValor = "observado" | "historico" | "estimado" | "simulado";

export interface Usuario {
  uid: string;
  nome: string;
  email: string;
  papel: "viajante" | "admin";
}

export interface Veiculo {
  modelo: string;
  combustivel: "gasolina" | "etanol" | "diesel" | "eletrico" | "flex";
  consumoKmL: number;
  passageiros: number;
  pedagios: boolean;
  estacionamento: boolean;
}

export interface Preferencias {
  origem: string;
  destino: string;
  dataInicio: string;
  dataFim: string;
  transporte: Transporte;
  veiculo?: Veiculo;
  interesses: string[];
  mobilidade: "sem-restricao" | "reduzida" | "cadeira-de-rodas";
  ritmo: "tranquilo" | "equilibrado" | "intenso";
  hospedagem: "hotel" | "pousada" | "hostel" | "apartamento";
  modoOrcamento: ModoOrcamento;
  limites: Record<CategoriaOrcamento, number>;
}

export interface ItemRoteiro {
  id: string;
  dia: number;
  titulo: string;
  inicio: string; // HH:mm
  duracaoMin: number;
  deslocamentoMin: number;
  margemMin: number;
  observacoes?: string;
  favorito?: boolean;
  motivo?: string;
  lat?: number;
  lng?: number;
  endereco?: string;
}

export interface ItemOrcamento {
  id: string;
  categoria: CategoriaOrcamento;
  descricao: string;
  valor: number;
  natureza: NaturezaValor;
}

export type StatusReserva =
  | "rascunho"
  | "aguardando-pagamento"
  | "concluida"
  | "confirmada-simulacao"
  | "cancelada-simulacao";

export interface Reserva {
  id: string;
  viagemId: string;
  protocolo: string;
  status: StatusReserva;
  total: number;
  criadaEm: string;
  chaveIdempotencia: string;
}

export interface Colaborador {
  email: string;
  nome: string;
  permissao: "leitura" | "edicao";
}

export interface Viagem {
  id: string;
  titulo: string;
  destino: string;
  origem: string;
  dataInicio: string;
  dataFim: string;
  transporte: Transporte;
  modoOrcamento: ModoOrcamento;
  limites: Record<CategoriaOrcamento, number>;
  roteiro: ItemRoteiro[];
  versoes: { id: string; criadaEm: string; itens: ItemRoteiro[] }[];
  orcamento: ItemOrcamento[];
  colaboradores: Colaborador[];
  tokenCompartilhamento: string;
}

export interface Lugar {
  placeId: string;
  nome: string;
  endereco: string;
  categoria: string;
  avaliacao?: number;
  nivelPreco?: number;
  distanciaKm?: number;
  aberto?: boolean;
  lat: number;
  lng: number;
  descricao?: string;
  fonte: string;
  consultadoEm: string;
  demonstrativo: boolean;
}

export interface Snapshot {
  data: string;
  preco: number;
}

export interface OfertaVoo {
  id: string;
  companhia: string;
  origem: string;
  destino: string;
  ida: string;
  volta?: string;
  passageiros: number;
  classe: string;
  bagagem: string;
  moeda: string;
  taxas: number;
  preco: number;
  fonte: string;
  consultadoEm: string;
  historico: Snapshot[];
  atualizacao?: { anterior: number; novo: number; motivo: string };
}

export interface OfertaHotel {
  id: string;
  hotel: string;
  quarto: string;
  hospedes: number;
  checkin: string;
  checkout: string;
  regime: string;
  politica: string;
  moeda: string;
  taxas: number;
  preco: number;
  fonte: string;
  consultadoEm: string;
  historico: Snapshot[];
}

export interface Recomendacao {
  id: string;
  tipo: "destino" | "lugar" | "atividade" | "voo" | "hospedagem";
  titulo: string;
  resumo: string;
  justificativa: string;
  evidencia: { fonte: string; consultadoEm: string };
  estado?: "aceita" | "rejeitada";
}

export interface MensagemAssistente {
  id: string;
  autor: "usuario" | "assistente";
  texto: string;
  recomendacoes?: Recomendacao[];
  incompleta?: boolean;
  criadaEm: string;
}

export interface Notificacao {
  id: string;
  titulo: string;
  texto: string;
  tipo: "preco" | "roteiro" | "colaboracao" | "sistema";
  lida: boolean;
  criadaEm: string;
}

export interface Relatorio {
  id: string;
  reservaId: string;
  viagemId: string;
  protocolo: string;
  geradoEm: string;
  nomeArquivo?: string;
}
