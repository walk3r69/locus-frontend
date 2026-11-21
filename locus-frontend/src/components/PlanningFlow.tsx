import { useEffect, useState, type FormEvent } from "react";
import { BedDouble, Check, ExternalLink, Plane, Search, Sparkles, X } from "lucide-react";
import { buscarHoteis, buscarLocalizacoes, buscarVoos } from "@/services/integracoes";
import type { CategoriaOrcamento, OfertaHotel, OfertaVoo, Recomendacao, Viagem } from "@/types";

type Etapa = "passagem" | "hospedagem" | "roteiro";
type OfertaSelecionada =
  | { tipo: "voo"; valor: OfertaVoo }
  | { tipo: "hospedagem"; valor: OfertaHotel };

const dinheiro = (valor: number, moeda: string) => {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);
  } catch {
    return `${moeda || "BRL"} ${valor.toFixed(2)}`;
  }
};

function codigoIata(valor: string | undefined, fallback: string): string {
  const normalizado = (valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  const conhecidos: Record<string, string> = {
    "sao paulo": "GRU",
    "sao paulo, sp": "GRU",
    salvador: "SSA",
    "salvador, ba": "SSA",
    curacao: "CUR",
    "willemstad, curacao": "CUR",
    lisboa: "LIS",
    "lisboa, portugal": "LIS",
    portugal: "LIS",
    madeira: "FNC",
    "ilha da madeira": "FNC",
    "ilha da madeira, portugal": "FNC",
    funchal: "FNC",
    recife: "REC",
    "rio de janeiro": "GIG",
    fortaleza: "FOR",
    natal: "NAT",
  };
  if (conhecidos[normalizado]) return conhecidos[normalizado];
  if (normalizado.includes("madeira") || normalizado.includes("funchal")) return "FNC";
  if (normalizado.includes("salvador")) return "SSA";
  if (normalizado.includes("lisboa") || normalizado === "portugal") return "LIS";
  if (normalizado.includes("curacao") || normalizado.includes("willemstad")) return "CUR";
  if (/^[a-z]{3}$/.test(normalizado)) return normalizado.toUpperCase();
  return fallback;
}

async function resolverCodigoIata(valor: string, fallback = ""): Promise<string> {
  const direto = codigoIata(valor, "");
  if (direto) return direto;
  const resultados = await buscarLocalizacoes(valor);
  return resultados[0]?.iataCode || fallback;
}

function valorInicialLocal(valor: string | undefined, fallback: string): string {
  return codigoIata(valor, "") || valor || fallback;
}

function recomendacaoOferta(
  tipo: "voo" | "hospedagem",
  titulo: string,
  resumo: string,
  valor: number,
  fonte: string,
  categoria: CategoriaOrcamento,
  localizacao?: { lat?: number; lng?: number; endereco?: string },
): Recomendacao {
  return {
    id: `${tipo}-${Date.now()}`,
    tipo,
    titulo,
    resumo,
    justificativa: "Escolhida por você na consulta de ofertas.",
    evidencia: { fonte, consultadoEm: new Date().toISOString() },
    ...(valor > 0 ? { valor } : {}),
    ...(localizacao?.lat != null ? { lat: localizacao.lat } : {}),
    ...(localizacao?.lng != null ? { lng: localizacao.lng } : {}),
    ...(localizacao?.endereco ? { endereco: localizacao.endereco } : {}),
    categoria,
    natureza: fonte.includes("simulado") ? "simulado" : "observado",
  };
}

export function PlanningFlow({
  viagem,
  etapaInicial,
  limite,
  acumulado = 0,
  onToast,
  onAdicionar,
}: {
  viagem: Viagem | null;
  etapaInicial: "passagem" | "hospedagem" | "roteiro" | "geral";
  limite: number | undefined;
  acumulado?: number;
  onToast: (value: string) => void;
  onAdicionar: (recomendacao: Recomendacao) => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>(etapaInicial === "hospedagem" ? "hospedagem" : etapaInicial === "roteiro" ? "roteiro" : "passagem");
  const [origem, setOrigem] = useState(valorInicialLocal(viagem?.origem, "GRU"));
  const [destino, setDestino] = useState(valorInicialLocal(viagem?.destino, ""));
  const [ida, setIda] = useState(viagem?.dataInicio || "");
  const [volta, setVolta] = useState(viagem?.dataFim || "");
  const [cidade, setCidade] = useState(valorInicialLocal(viagem?.destino, ""));
  const [entrada, setEntrada] = useState(viagem?.dataInicio || "");
  const [saida, setSaida] = useState(viagem?.dataFim || "");
  const [voos, setVoos] = useState<OfertaVoo[]>([]);
  const [hoteis, setHoteis] = useState<OfertaHotel[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ofertaSelecionada, setOfertaSelecionada] = useState<OfertaSelecionada | null>(null);
  const restante = limite == null ? undefined : Math.max(0, limite - acumulado);

  useEffect(() => {
    if (!viagem || !cidade || !entrada || !saida) return;
    let ativo = true;
    setCarregando(true);
    void resolverCodigoIata(cidade)
      .then((cityCode) => cityCode
        ? buscarHoteis({ cityCode, checkInDate: entrada, checkOutDate: saida, adults: 1, roomQuantity: 1 })
        : [])
      .then((resultado) => {
        if (ativo) setHoteis(resultado);
      })
      .catch(() => undefined)
      .finally(() => {
        if (ativo) setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [viagem?.id, cidade, entrada, saida]);

  function podeAdicionar(valor: number): boolean {
    return restante == null || valor <= restante;
  }

  function adicionarVoo(voo: OfertaVoo) {
    if (!podeAdicionar(voo.preco)) {
      onToast("Essa opção ultrapassa o limite restante do seu orçamento. Escolha outra oferta.");
      return;
    }
    setOfertaSelecionada({ tipo: "voo", valor: voo });
  }

  function adicionarHotel(hotel: OfertaHotel) {
    if (hotel.preco > 0 && !podeAdicionar(hotel.preco)) {
      onToast("Essa hospedagem ultrapassa o limite restante do seu orçamento. Escolha outra oferta.");
      return;
    }
    setOfertaSelecionada({ tipo: "hospedagem", valor: hotel });
  }

  function confirmarOferta() {
    if (!ofertaSelecionada) return;
    if (ofertaSelecionada.tipo === "voo") {
      const voo = ofertaSelecionada.valor;
      onAdicionar(recomendacaoOferta("voo", `Passagem ${voo.origem} → ${voo.destino}`, `${voo.companhia} · ${dinheiro(voo.preco, voo.moeda)}`, voo.preco, voo.fonte, "passagem"));
    } else {
      const hotel = ofertaSelecionada.valor;
      onAdicionar(recomendacaoOferta("hospedagem", hotel.hotel, `${hotel.quarto} · ${hotel.preco ? dinheiro(hotel.preco, hotel.moeda) : "Oferta consultada"}`, hotel.preco, hotel.fonte, "hospedagem", {
        ...(hotel.latitude != null ? { lat: hotel.latitude } : {}),
        ...(hotel.longitude != null ? { lng: hotel.longitude } : {}),
        endereco: hotel.hotel,
      }));
    }
    setOfertaSelecionada(null);
    onToast("Oferta adicionada ao roteiro. O total foi atualizado.");
  }

  async function pesquisarVoos(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!origem || !destino || !ida) {
      onToast("Informe origem, destino e data de ida para consultar passagens.");
      return;
    }
    setCarregando(true);
    try {
      const [origemCode, destinoCode] = await Promise.all([resolverCodigoIata(origem), resolverCodigoIata(destino)]);
      if (!origemCode || !destinoCode) {
        onToast("Informe uma cidade ou código IATA reconhecido para origem e destino.");
        return;
      }
      const resultado = await buscarVoos({ originLocationCode: origemCode, destinationLocationCode: destinoCode, departureDate: ida, ...(volta ? { returnDate: volta } : {}), adults: 1, max: 6 });
      setVoos(resultado);
      onToast(resultado.length ? "Passagens encontradas. Abra uma opção para conferir os detalhes." : "Nenhuma passagem encontrada para esses filtros.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Não foi possível consultar as passagens.");
    } finally {
      setCarregando(false);
    }
  }

  async function pesquisarHoteis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cidade || !entrada || !saida) {
      onToast("Informe destino e as datas da hospedagem.");
      return;
    }
    setCarregando(true);
    try {
      const cityCode = await resolverCodigoIata(cidade);
      if (!cityCode) {
        onToast("Informe uma cidade ou código IATA reconhecido para buscar hospedagens.");
        return;
      }
      const resultado = await buscarHoteis({ cityCode, checkInDate: entrada, checkOutDate: saida, adults: 1, roomQuantity: 1 });
      setHoteis(resultado);
      onToast(resultado.length ? "Hospedagens encontradas. Abra uma opção para ver a imagem." : "Nenhuma hospedagem encontrada para esses filtros.");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Não foi possível consultar as hospedagens.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="planning-flow side-card">
      <div className="side-card-heading">
        <div>
          <span className="section-label">Planejamento guiado</span>
          <h3>Passagem, hospedagem e roteiro</h3>
          <small className="planning-source">A fonte e a data da consulta aparecem em cada opção. Confirme disponibilidade antes de comprar.</small>
        </div>
        <Sparkles size={18} />
      </div>
      <div className="planning-budget">
        <span>{limite == null ? "Orçamento aberto" : `Saldo disponível ${dinheiro(restante ?? 0, "BRL")}`}</span>
        <strong>{dinheiro(acumulado, "BRL")} acumulado</strong>
      </div>
      <div className="planning-steps">
        {(["passagem", "hospedagem", "roteiro"] as Etapa[]).map((item, index) => (
          <button key={item} className={etapa === item ? "active" : ""} type="button" onClick={() => setEtapa(item)}>
            <span>{index + 1}</span>{item === "passagem" ? "Passagem" : item === "hospedagem" ? "Hospedagem" : "Roteiro"}
          </button>
        ))}
      </div>
      {etapa === "passagem" && (
        <form className="planning-form" onSubmit={(event) => void pesquisarVoos(event)}>
          <div className="form-grid compact">
            <label>Origem<input value={origem} onChange={(event) => setOrigem(event.target.value.toUpperCase())} placeholder="SSA ou Salvador" maxLength={30} /></label>
            <label>Destino<input value={destino} onChange={(event) => setDestino(event.target.value.toUpperCase())} placeholder="CUR ou Curaçao" maxLength={30} /></label>
          </div>
          <div className="form-grid compact">
            <label>Ida<input type="date" value={ida} onChange={(event) => setIda(event.target.value)} /></label>
            <label>Volta<input type="date" value={volta} onChange={(event) => setVolta(event.target.value)} /></label>
          </div>
          <button className="secondary-button full-button" disabled={carregando} type="submit"><Search size={15} />{carregando ? "Consultando..." : "Buscar passagens"}</button>
          {voos.map((voo) => {
            const acima = !podeAdicionar(voo.preco);
            return <div className={`offer-result ${acima ? "over-budget" : ""}`} key={voo.id}>
              <div><strong>{voo.companhia}</strong><small>{voo.origem} → {voo.destino} · {voo.fonte}</small></div>
              <b>{dinheiro(voo.preco, voo.moeda)}</b>
              <button type="button" disabled={acima} onClick={() => adicionarVoo(voo)}><Check size={14} />{acima ? "Acima do limite" : "Ver e escolher"}</button>
            </div>;
          })}
        </form>
      )}
      {etapa === "hospedagem" && (
        <form className="planning-form" onSubmit={(event) => void pesquisarHoteis(event)}>
          <label>Destino<input value={cidade} onChange={(event) => setCidade(event.target.value.toUpperCase())} placeholder="CUR ou Curaçao" maxLength={30} /></label>
          <div className="form-grid compact">
            <label>Entrada<input type="date" value={entrada} onChange={(event) => setEntrada(event.target.value)} /></label>
            <label>Saída<input type="date" value={saida} onChange={(event) => setSaida(event.target.value)} /></label>
          </div>
          <button className="secondary-button full-button" disabled={carregando} type="submit"><Search size={15} />{carregando ? "Consultando..." : "Buscar hospedagens"}</button>
          <div className="hotel-offers">
            {hoteis.map((hotel) => {
              const acima = hotel.preco > 0 && !podeAdicionar(hotel.preco);
              return <div className={`hotel-offer ${acima ? "over-budget" : ""}`} key={hotel.id}>
                {hotel.imagemUrl && <img src={hotel.imagemUrl} alt={`Imagem de ${hotel.hotel}`} />}
                <div className="hotel-offer-body"><strong>{hotel.hotel}</strong><small>{hotel.checkin} → {hotel.checkout} · {hotel.fonte}</small><b>{hotel.preco ? dinheiro(hotel.preco, hotel.moeda) : "Consultar"}</b><button type="button" disabled={acima} onClick={() => adicionarHotel(hotel)}><BedDouble size={14} />{acima ? "Acima do limite" : "Ver e escolher"}</button></div>
              </div>;
            })}
          </div>
        </form>
      )}
      {etapa === "roteiro" && <div className="planning-next-step"><Plane size={20} /><p>Escolha os lugares buscados pela IA ou pesquise ao lado. O Locus organiza os pontos próximos e calcula o deslocamento antes de adicionar ao roteiro.</p></div>}
      {ofertaSelecionada && (
        <div className="offer-modal-backdrop" role="dialog" aria-modal="true" aria-label="Detalhes da oferta">
          <div className="offer-modal">
            <button className="offer-modal-close" type="button" onClick={() => setOfertaSelecionada(null)} aria-label="Fechar"><X size={17} /></button>
            {ofertaSelecionada.tipo === "hospedagem" ? <>
              {ofertaSelecionada.valor.imagemUrl && <img className="offer-modal-image" src={ofertaSelecionada.valor.imagemUrl} alt={`Imagem de ${ofertaSelecionada.valor.hotel}`} />}
              <span className="section-label">Hospedagem</span>
              <h3>{ofertaSelecionada.valor.hotel}</h3>
              <p>{ofertaSelecionada.valor.checkin} → {ofertaSelecionada.valor.checkout} · {ofertaSelecionada.valor.quarto}</p>
              <strong className="offer-modal-price">{ofertaSelecionada.valor.preco ? dinheiro(ofertaSelecionada.valor.preco, ofertaSelecionada.valor.moeda) : "Consultar oferta"}</strong>
            </> : <>
              <span className="section-label">Passagem</span>
              <h3>{ofertaSelecionada.valor.companhia} · {ofertaSelecionada.valor.origem} → {ofertaSelecionada.valor.destino}</h3>
              <p>Ida: {ofertaSelecionada.valor.ida ? new Date(ofertaSelecionada.valor.ida).toLocaleString("pt-BR") : "Data informada"}</p>
              <strong className="offer-modal-price">{dinheiro(ofertaSelecionada.valor.preco, ofertaSelecionada.valor.moeda)}</strong>
            </>}
            <small className="planning-source">{ofertaSelecionada.valor.fonte}. O valor será somado ao total da viagem.</small>
            <div className="offer-modal-actions"><button className="secondary-button" type="button" onClick={() => setOfertaSelecionada(null)}>Voltar</button><button className="primary-button" type="button" onClick={confirmarOferta}><Check size={15} /> Adicionar ao roteiro</button></div>
            {ofertaSelecionada.tipo === "hospedagem" && ofertaSelecionada.valor.latitude && ofertaSelecionada.valor.longitude && <a className="offer-map-link" href={`https://www.google.com/maps/search/?api=1&query=${ofertaSelecionada.valor.latitude},${ofertaSelecionada.valor.longitude}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Ver localização no Google Maps</a>}
          </div>
        </div>
      )}
    </div>
    );
  }
