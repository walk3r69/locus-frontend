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
    categoria: texto(types[0]) || "Ponto de interesse",
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
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = objeto(candidates[0]);
  const content = objeto(first.content);
  const parts = Array.isArray(content.parts) ? content.parts : [];
  return parts
    .map((part: Json) => texto(objeto(part).text))
    .filter(Boolean)
    .join("\n");
}

// ---------- Assistente Locus (Gemini com fallback Groq no backend) ----------
export async function perguntarGemini(
  historico: MensagemAssistente[],
  textoPergunta: string,
): Promise<MensagemAssistente> {
  const contexto = historico
    .slice(-8)
    .map((item) => `${item.autor === "usuario" ? "Usuário" : "Assistente"}: ${item.texto}`)
    .join("\n");
  const prompt = [contexto, `Usuário: ${textoPergunta}`].filter(Boolean).join("\n\n");
  const raw = await chamar(() =>
    api.post<Json>(`${BASE}/gemini/conteudo`, { prompt }, { timeout: 30000 }),
  );
  return {
    id: uid(),
    autor: "assistente",
    texto: textoGemini(raw) || "Recebi uma resposta vazia. Tente reformular a pergunta.",
    criadaEm: new Date().toISOString(),
  };
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
  data?: string;
}

export async function streetViewMetadata(lat: number, lng: number): Promise<StreetViewMeta> {
  const resultado = await chamar<StreetViewMeta>(() =>
    api.get<StreetViewMeta>(`${BASE}/google/street-view/metadata`, {
      params: { location: `${lat},${lng}` },
    }),
  );
  const key = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
  return key && resultado.status === "OK"
    ? {
        ...resultado,
        imagemUrl: `https://maps.googleapis.com/maps/api/streetview?size=640x360&location=${lat},${lng}&key=${encodeURIComponent(key)}`,
      }
    : resultado;
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
    volta: texto(objeto(objeto(itineraries[1]).segments?.[0]).departure),
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
    fonte: value.simulated === true ? "Locus (simulado)" : "Provedor configurado",
    consultadoEm: new Date().toISOString(),
    historico: [],
  };
}
