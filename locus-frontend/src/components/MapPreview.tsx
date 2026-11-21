import type { Lugar } from "@/types";

export function MapPreview({ lugares }: { lugares: Lugar[] }) {
  const key = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;
  if (!lugares.length) return null;
  if (!key)
    return (
      <div className="map-preview map-preview-empty">
        <strong>Confira os lugares no Google Maps</strong>
        <span>Você pode abrir o endereço e o Street View de cada lugar antes de escolher.</span>
      </div>
    );
  const pontos = lugares.filter((item) => item.lat && item.lng).slice(0, 6);
  const markers = pontos.map((item) => `markers=${encodeURIComponent(`${item.lat},${item.lng}`)}`).join("&");
  const primeiro = pontos[0];
  const mapa = primeiro
    ? `https://maps.googleapis.com/maps/api/staticmap?size=900x300&scale=2&maptype=roadmap&${markers}&center=${encodeURIComponent(`${primeiro.lat},${primeiro.lng}`)}&zoom=11&key=${encodeURIComponent(key)}`
    : "";
  return (
    <div className="map-preview" aria-label="Mapa dos lugares encontrados">
      {mapa && <img src={mapa} alt="Mapa dos locais encontrados" />}
      <a href={primeiro ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${primeiro.lat},${primeiro.lng}`)}` : "https://maps.google.com"} target="_blank" rel="noreferrer">Abrir no Google Maps</a>
    </div>
  );
}
