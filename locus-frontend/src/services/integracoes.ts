import type { Lugar, MensagemAssistente, OfertaHotel, OfertaVoo } from "@/types";
import { api, chamar } from "./api";
import { uid } from "./ids";

/** O navegador chama apenas o backend; as chaves dos provedores nunca ficam aqui. */
const BASE = "/api/integracoes";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

const texto = (value: unknown) => (typeof value === "string" ? value : "");
const numero = (value: unknown, fallback = 0) =>
  typeof value === "number" ? value : Number(value ?? fallback) || fallback;
const objeto = (value: unknown): Json =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};

function rotuloTipoLugar(tipo: unknown): string {
  const rotulos: Record<string, string> = {
    tourist_attraction: "Ponto turístico",
    historical_landmark: "Lugar histórico",
    museum: "Museu",
    art_gallery: "Galeria de arte",
    park: "Parque",
    beach: "Praia",
    restaurant: "Restaurante",
    cafe: "Café",
    lodging: "Hospedagem",
    hotel: "Hotel",
    church: "Igreja",
    shopping_mall: "Shopping",
    natural_feature: "Atração natural",
  };
  const valor = texto(tipo);
  return rotulos[valor] || valor.replaceAll("_", " ") || "Ponto de interesse";
}

function normalizarLugar(raw: unknown): Lugar {
  const value = objeto(raw);
  const displayName = objeto(value.displayName);
  const location = objeto(value.location);
  const opening = objeto(value.currentOpeningHours);
  const types = Array.isArray(value.types) ? value.types : [];
  const lugar: Lugar = {
    placeId: texto(value.id) || texto(value.name),
    nome: texto(displayName.text) || texto(value.name) || "Lugar sem nome",
    endereco: texto(value.formattedAddress) || texto(value.shortFormattedAddress),
    categoria: rotuloTipoLugar(types[0]),
    lat: numero(location.latitude),
    lng: numero(location.longitude),
    descricao: texto(value.editorialSummary),
    fonte: "Google Places",
    consultadoEm: new Date().toISOString(),
    demonstrativo: false,
  };
  if (typeof value.rating === "number") lugar.avaliacao = value.rating;
  if (typeof value.priceLevel === "number") lugar.nivelPreco = value.priceLevel;
  if (typeof opening.openNow === "boolean") lugar.aberto = opening.openNow;
  return lugar;
}

function textoGemini(raw: unknown): string {
  const root = objeto(raw);
  const choices = Array.isArray(root.choices) ? root.choices : [];
  const choiceMessage = objeto(objeto(choices[0]).message);
  const choiceText = texto(choiceMessage.content);
  if (choiceText) return choiceText;
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = objeto(candidates[0]);
  const content = objeto(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part: Json) => texto(objeto(part).text))
    .filter(Boolean)
    .join("\n");
}

function jsonDaResposta(textoResposta: string): Json {
  const limpo = textoResposta
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return objeto(JSON.parse(limpo));
  } catch {
    const inicio = limpo.indexOf("{");
    const fim = limpo.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) {
      try {
        return objeto(JSON.parse(limpo.slice(inicio, fim + 1)));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function normalizarRecomendacoes(raw: unknown): MensagemAssistente["recomendacoes"] {
  if (!Array.isArray(raw)) return undefined;
  return raw.map((item: Json, index) => {
    const value = objeto(item);
    const evidencia = objeto(value.evidencia);
    const categoria = texto(value.categoria) as NonNullable<MensagemAssistente["recomendacoes"]>[number]["categoria"];
    const natureza = texto(value.natureza) as NonNullable<MensagemAssistente["recomendacoes"]>[number]["natureza"];
    return {
      id: texto(value.id) || `recomendacao-${Date.now()}-${index}`,
      tipo: (texto(value.tipo) || "lugar") as NonNullable<MensagemAssistente["recomendacoes"]>[number]["tipo"],
      titulo: texto(value.titulo) || "Sugestão de viagem",
      resumo: texto(value.resumo) || "Confira esta possibilidade antes de adicionar ao roteiro.",
      justificativa: texto(value.justificativa) || "Combina com o contexto informado.",
      evidencia: {
        fonte: texto(evidencia.fonte) || "Consulta do Locus",
        consultadoEm: texto(evidencia.consultadoEm) || new Date().toISOString(),
      },
      ...(texto(value.consulta) ? { consulta: texto(value.consulta) } : {}),
      ...(texto(value.placeId) ? { placeId: texto(value.placeId) } : {}),
      ...(Number.isFinite(Number(value.avaliacao)) ? { avaliacao: Number(value.avaliacao) } : {}),
      ...(texto(value.endereco) ? { endereco: texto(value.endereco) } : {}),
      ...(Number.isFinite(Number(value.lat)) ? { lat: Number(value.lat) } : {}),
      ...(Number.isFinite(Number(value.lng)) ? { lng: Number(value.lng) } : {}),
      ...(texto(value.categoriaLocal) ? { categoriaLocal: texto(value.categoriaLocal) } : {}),
      ...(Number.isInteger(Number(value.dia)) ? { dia: Number(value.dia) } : {}),
      ...(Number.isInteger(Number(value.duracaoMinutos)) ? { duracaoMinutos: Number(value.duracaoMinutos) } : {}),
      ...(Number.isFinite(Number(value.valor)) ? { valor: Number(value.valor) } : {}),
      ...(categoria ? { categoria } : {}),
      ...(natureza ? { natureza } : {}),
    };
  });
}

function interpretarAssistente(raw: unknown): Pick<MensagemAssistente, "texto" | "recomendacoes" | "consultas" | "etapa"> {
  const textoResposta = textoGemini(raw);
  const objetoResposta = jsonDaResposta(textoResposta);
  const consultas = Array.isArray(objetoResposta.consultas)
    ? objetoResposta.consultas.map(texto).filter(Boolean)
    : [];
  const etapa = texto(objetoResposta.etapa) as MensagemAssistente["etapa"];
  const recomendacoes = normalizarRecomendacoes(objetoResposta.recomendacoes);
  return {
    texto: texto(objetoResposta.resposta) || textoResposta || "Recebi uma resposta vazia. Tente reformular a pergunta.",
    ...(consultas.length ? { consultas } : {}),
    ...(recomendacoes?.length ? { recomendacoes } : {}),
    ...(etapa ? { etapa } : {}),
  };
}

type ContextoAssistente = {
  modoOrcamento?: "fixo" | "aberto";
  limite?: number;
  acumulado?: number;
  origem?: string;
  destino?: string;
  dataInicio?: string;
  dataFim?: string;
  transporte?: string;
  interesses?: string[];
  ritmo?: string;
  hospedagem?: string;
  hospedagemBase?: string;
  roteiro?: string;
};

function respostaLocalAssistente(textoPergunta: string, contexto?: ContextoAssistente): MensagemAssistente {
  const destino = contexto?.destino?.trim();
  const pergunta = textoPergunta.toLowerCase();
  const querHospedagem = /hotel|hospedagem|pousada|hostel|onde ficar/.test(pergunta);
  const querPassagem = /passagem|passagens|voo|voos|avião|aviao/.test(pergunta);
  const consultas = destino
    ? [
        querHospedagem
          ? `hotéis e hospedagens reais em ${destino}`
          : querPassagem
            ? `pontos de apoio e aeroporto em ${destino}`
            : `pontos turísticos, praias e atrações em ${destino}`,
        ...(contexto?.interesses?.length ? [`${contexto.interesses.join(", ")} em ${destino}`] : []),
      ]
    : [];
  const limite = contexto?.limite == null
    ? "Orçamento aberto: vou somar cada escolha."
    : `Saldo disponível aproximado: R$ ${Math.max(0, contexto.limite - (contexto.acumulado ?? 0)).toFixed(2)}.`;
  return {
    id: uid(),
    autor: "assistente",
    texto: destino
      ? `Entendi. Vou buscar opções reais em ${destino}, organizar por proximidade e separar as sugestões por dia. ${limite} Confira os resultados e o Street View antes de adicionar.`
      : "Para montar recomendações reais, preciso saber qual é o destino da viagem. Informe a cidade e o país no chat ou crie uma viagem primeiro.",
    ...(consultas.length ? { consultas } : {}),
    etapa: querPassagem ? "passagem" : querHospedagem ? "hospedagem" : "roteiro",
    criadaEm: new Date().toISOString(),
  };
}

// ---------- Assistente Locus (Gemini com fallback Groq no backend) ----------
export async function perguntarGemini(
  historico: MensagemAssistente[],
  textoPergunta: string,
  contexto?: ContextoAssistente,
): Promise<MensagemAssistente> {
  const historicoTexto = historico
    .slice(-8)
    .map((item) => `${item.autor === "usuario" ? "Usuário" : "Assistente"}: ${item.texto}`)
    .join("\n");
  const financeiro = contexto
    ? `Contexto financeiro: orçamento ${contexto.modoOrcamento === "fixo" ? "FIXO" : "ABERTO"}; `
      + `valor já acumulado R$ ${(contexto.acumulado ?? 0).toFixed(2)}; `
      + (contexto.limite == null
        ? "sem limite máximo."
        : `limite total R$ ${contexto.limite.toFixed(2)} e saldo restante R$ ${Math.max(0, contexto.limite - (contexto.acumulado ?? 0)).toFixed(2)}.`)
    : "";
  const viagem = contexto
    ? [
        contexto.origem ? `Origem: ${contexto.origem}.` : "",
        contexto.destino ? `Destino obrigatório desta viagem: ${contexto.destino}.` : "",
        contexto.dataInicio && contexto.dataFim ? `Datas: ${contexto.dataInicio} até ${contexto.dataFim}.` : "",
        contexto.transporte ? `Transporte escolhido: ${contexto.transporte}.` : "",
        contexto.interesses?.length ? `Interesses: ${contexto.interesses.join(", ")}.` : "",
        contexto.ritmo ? `Ritmo: ${contexto.ritmo}.` : "",
        contexto.hospedagem ? `Hospedagem preferida: ${contexto.hospedagem}.` : "",
        contexto.hospedagemBase ? `Base de proximidade obrigatória: ${contexto.hospedagemBase}. Recomende locais turísticos próximos dessa hospedagem.` : "",
        contexto.roteiro ? `Itens já adicionados ao roteiro: ${contexto.roteiro}.` : "",
      ].filter(Boolean).join(" ")
    : "";
  const regras = "Não repita saudações nem perguntas já respondidas. Recomende somente locais dentro do destino obrigatório; para locais nomeados, gere consultas ao Google Places e deixe a confirmação dos dados para a busca real. Quando houver hospedagem-base, priorize locais em até 20 km dela e informe que o sistema vai conferir a distância e a rota.";
  const prompt = [financeiro, viagem, regras, historicoTexto, `Usuário: ${textoPergunta}`]
    .filter(Boolean)
    .join("\n\n");
  try {
    const raw = await chamar(() =>
      api.post<Json>(`${BASE}/gemini/conteudo`, { prompt }, { timeout: 30000 }),
    );
    const interpretada = interpretarAssistente(raw);
    if (interpretada.texto !== "Recebi uma resposta vazia. Tente reformular a pergunta." || interpretada.consultas?.length) {
      return {
        id: uid(),
        autor: "assistente",
        ...interpretada,
        criadaEm: new Date().toISOString(),
      };
    }
  } catch {
    // O planejador local mantém o chat útil enquanto o provedor de IA se recupera.
  }
  return respostaLocalAssistente(textoPergunta, contexto);
}

// ---------- Google Places ----------
export interface ResultadoBusca {
  lugares: Lugar[];
  fallback: boolean;
}

export async function buscaTextual(q: string): Promise<ResultadoBusca> {
  const raw = await chamar<Json>(() =>
    api.post(`${BASE}/google/places/busca-textual`, { textQuery: q, languageCode: "pt-BR" }),
  );
  const places = Array.isArray(raw.places) ? raw.places : [];
  return { lugares: places.map(normalizarLugar), fallback: false };
}

export async function autocomplete(q: string): Promise<{ id: string; texto: string }[]> {
  if (q.length < 2) return [];
  const raw = await chamar<Json>(() =>
    api.post(`${BASE}/google/places/autocomplete`, { input: q }),
  );
  const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions : [];
  return suggestions
    .map((item: Json) => {
      const prediction = objeto(objeto(item).placePrediction);
      const description = objeto(prediction.text);
      return {
        id: texto(prediction.placeId),
        texto: texto(description.text) || texto(prediction.placeId),
      };
    })
    .filter((item: { id: string; texto: string }) => item.id || item.texto);
}

export async function detalhesLugar(placeId: string): Promise<Lugar> {
  return normalizarLugar(
    await chamar<Json>(() => api.get(`${BASE}/google/places/${encodeURIComponent(placeId)}`)),
  );
}

// ---------- Google Routes ----------
export interface Trecho {
  de: string;
  para: string;
  minutos: number;
  km: number;
}

export async function calcularRota(
  pontos: { lat: number; lng: number; nome: string }[],
): Promise<Trecho[]> {
  if (pontos.length < 2) return [];
  const toWaypoint = (point: { lat: number; lng: number }) => ({
    location: { latLng: { latitude: point.lat, longitude: point.lng } },
  });
  const raw = await chamar<Json>(() =>
    api.post(`${BASE}/google/routes`, {
      origin: toWaypoint(pontos[0]!),
      destination: toWaypoint(pontos[pontos.length - 1]!),
      intermediates: pontos.slice(1, -1).map(toWaypoint),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      languageCode: "pt-BR",
      units: "METRIC",
    }),
  );
  const routes = Array.isArray(raw.routes) ? raw.routes : [];
  const legs = Array.isArray(objeto(routes[0]).legs) ? objeto(routes[0]).legs : [];
  return legs.map((leg: Json, index: number) => {
    const item = objeto(leg);
    const duration = texto(item.duration).replace(/s$/, "");
    return {
      de: pontos[index]?.nome ?? "Origem",
      para: pontos[index + 1]?.nome ?? "Destino",
      minutos: Math.ceil(numero(duration) / 60),
      km: numero(item.distanceMeters) / 1000,
    };
  });
}

// ---------- Street View ----------
export interface StreetViewMeta {
  status: string;
  imagemUrl?: string;
  mapaUrl?: string;
  data?: string;
}

export async function streetViewMetadata(lat: number, lng: number): Promise<StreetViewMeta> {
  const resultado = await chamar<StreetViewMeta>(() =>
    api.get<StreetViewMeta>(`${BASE}/google/street-view/metadata`, {
      params: { location: `${lat},${lng}` },
    }),
  );
  const key = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
  return {
    ...resultado,
    ...(key && resultado.status === "OK"
      ? {
          imagemUrl: `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${lat},${lng}&key=${encodeURIComponent(key)}`,
        }
      : {}),
    mapaUrl: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`,
  };
}

// ---------- Catálogo de ofertas do Locus ----------
function normalizarVoo(raw: unknown): OfertaVoo {
  const value = objeto(raw);
  const price = objeto(value.price);
  const itineraries = Array.isArray(value.itineraries) ? value.itineraries : [];
  const firstItinerary = objeto(itineraries[0]);
  const segments = Array.isArray(firstItinerary.segments) ? firstItinerary.segments : [];
  const first = objeto(segments[0]);
  const last = objeto(segments[segments.length - 1]);
  const returnItinerary = objeto(itineraries[1]);
  const returnSegments = Array.isArray(returnItinerary.segments) ? returnItinerary.segments : [];
  const returnDeparture = objeto(objeto(returnSegments[0]).departure);
  const departure = objeto(first.departure);
  const arrival = objeto(last.arrival);
  return {
    id: texto(value.id),
    companhia:
      (Array.isArray(value.validatingAirlineCodes) ? texto(value.validatingAirlineCodes[0]) : "") ||
      "Companhia aérea",
    origem: texto(departure.iataCode),
    destino: texto(arrival.iataCode),
    ida: texto(departure.at),
    volta: texto(returnDeparture.at),
    passageiros: 1,
    classe: "Econômica",
    bagagem: "Consultar oferta",
    moeda: texto(price.currency) || "BRL",
    taxas: numero(price.total) - numero(price.base),
    preco: numero(price.total),
    fonte: value.simulated === true ? "Locus (simulado)" : "Provedor configurado",
    consultadoEm: new Date().toISOString(),
    historico: [],
  };
}

export async function buscarVoos(params: Record<string, string | number>): Promise<OfertaVoo[]> {
  const raw = await chamar<Json>(() => api.get(`${BASE}/ofertas/voos`, { params }));
  return (Array.isArray(raw.data) ? raw.data : []).map(normalizarVoo);
}

export async function buscarLocalizacoes(keyword: string): Promise<{ iataCode: string; nome: string }[]> {
  const raw = await chamar<Json>(() => api.get(`${BASE}/ofertas/localizacoes`, { params: { keyword } }));
  return (Array.isArray(raw.data) ? raw.data : [])
    .map((item: Json) => {
      const address = objeto(item.address);
      return {
        iataCode: texto(item.iataCode).toUpperCase(),
        nome: texto(address.cityName) || texto(item.name?.cityName) || texto(item.name),
      };
    })
    .filter((item: { iataCode: string; nome: string }) => /^[A-Z]{3}$/.test(item.iataCode));
}

export async function precificarVoo(oferta: OfertaVoo | Json): Promise<Json> {
  return chamar(() => api.post<Json>(`${BASE}/ofertas/voos/preco`, oferta));
}

export async function buscarHoteis(
  params: Record<string, string | number>,
): Promise<OfertaHotel[]> {
  const lista = await chamar<Json>(() =>
    api.get(`${BASE}/ofertas/hoteis`, { params: { cityCode: params["cityCode"] } }),
  );
  const hotels = Array.isArray(lista.data) ? lista.data : [];
  const ids =
    texto(params["hotelIds"]) ||
    hotels
      .map((hotel: Json) => texto(objeto(hotel).hotelId))
      .filter(Boolean)
      .join(",");
  if (!ids) return [];
  const raw = await chamar<Json>(() =>
    api.get(`${BASE}/ofertas/hoteis/ofertas`, { params: { ...params, hotelIds: ids } }),
  );
  return (Array.isArray(raw.data) ? raw.data : []).map(normalizarHotel);
}

function normalizarHotel(raw: unknown): OfertaHotel {
  const value = objeto(raw);
  const hotel = objeto(value.hotel);
  const offer = objeto(Array.isArray(value.offers) ? value.offers[0] : value);
  const price = objeto(offer.price);
  return {
    id: texto(offer.id) || texto(hotel.hotelId),
    hotel: texto(hotel.name) || "Hotel",
    quarto: "Consultar oferta",
    hospedes: 1,
    checkin: texto(offer.checkInDate),
    checkout: texto(offer.checkOutDate),
    regime: "Consultar oferta",
    politica: "Consultar oferta",
    moeda: texto(price.currency) || "BRL",
    taxas: 0,
    preco: numero(price.total),
    ...(texto(hotel.imageUrl)
      ? { imagemUrl: texto(hotel.imageUrl) }
      : value.simulated === true
        ? {
            imagemUrl: [
              "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=900&q=80",
              "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=900&q=80",
              "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=900&q=80",
            ][Math.abs(texto(hotel.hotelId).length) % 3] ?? "",
          }
        : {}),
    latitude: numero(objeto(hotel.geoCode).latitude),
    longitude: numero(objeto(hotel.geoCode).longitude),
    fonte: value.simulated === true ? "Locus (simulado)" : "Provedor configurado",
    consultadoEm: new Date().toISOString(),
    historico: [],
  };
}
