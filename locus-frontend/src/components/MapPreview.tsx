import { useEffect, useRef, useState } from "react";
import type { Lugar } from "@/types";

type MapApi = {
  maps: {
    Map: new (
      element: HTMLElement,
      options: Record<string, unknown>,
    ) => {
      setCenter: (center: { lat: number; lng: number }) => void;
    };
    Marker: new (options: Record<string, unknown>) => unknown;
  };
};

declare global {
  interface Window {
    google?: MapApi;
  }
}

let loader: Promise<void> | null = null;

function carregarMaps(key: string): Promise<void> {
  if (window.google?.maps) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.dataset["locusMaps"] = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Não foi possível carregar o Google Maps."));
    document.head.appendChild(script);
  });
  return loader;
}

export function MapPreview({ lugares }: { lugares: Lugar[] }) {
  const element = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState("");
  const key = import.meta.env["VITE_GOOGLE_MAPS_API_KEY"] as string | undefined;

  useEffect(() => {
    if (!element.current || !lugares.length || !key) return;
    let ativo = true;
    void carregarMaps(key)
      .then(() => {
        if (!ativo || !element.current || !window.google) return;
        const primeiro = lugares.find((item) => item.lat && item.lng) ?? lugares[0];
        const center = { lat: primeiro?.lat ?? 0, lng: primeiro?.lng ?? 0 };
        const map = new window.google.maps.Map(element.current, {
          center,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        lugares
          .filter((item) => item.lat && item.lng)
          .forEach((lugar) => {
            new window.google!.maps.Marker({
              map,
              position: { lat: lugar.lat, lng: lugar.lng },
              title: lugar.nome,
            });
          });
      })
      .catch((error: Error) => ativo && setErro(error.message));
    return () => {
      ativo = false;
    };
  }, [key, lugares]);

  if (!lugares.length) return null;
  if (!key)
    return (
      <div className="map-preview map-preview-empty">
        <strong>Mapa aguardando configuração</strong>
        <span>Preencha VITE_GOOGLE_MAPS_API_KEY no .env do frontend.</span>
      </div>
    );
  if (erro) return <div className="map-preview map-preview-empty">{erro}</div>;
  return <div className="map-preview" ref={element} aria-label="Mapa dos lugares encontrados" />;
}
