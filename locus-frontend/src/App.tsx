import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  CheckCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Compass,
  Download,
  Eye,
  FileText,
  Globe2,
  Heart,
  Home,
  LogOut,
  Map,
  MapPin,
  Menu,
  Navigation,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

import { api, normalizarErro } from "@/services/api";
import { entrar, entrarComGoogle, sair, usuarioAtual } from "@/services/auth";
import {
  autocomplete,
  buscaTextual,
  calcularRota,
  perguntarGemini,
  streetViewMetadata,
  type StreetViewMeta,
  type Trecho,
} from "@/services/integracoes";
import { lerPreferenciasBackend } from "@/services/preferencias";
import { confirmarRoteiro } from "@/services/reservas";
import { baixarRelatorio, listarRelatorios } from "@/services/relatorios";
import { adicionarRecomendacao, criarRoteiroInicial } from "@/services/roteiros";
import { sincronizarUsuario } from "@/services/usuarioBackend";
import { criarViagem, listarNotificacoes, listarViagens, marcarLida, marcarTodasComoLidas, obterViagem } from "@/services/viagens";
import { MapPreview } from "@/components/MapPreview";
import { AdminView } from "@/components/AdminView";
import { PlanningFlow } from "@/components/PlanningFlow";
import { PreferencesView } from "@/components/PreferencesView";
import { brl, CATEGORIAS, resumirOrcamento } from "@/features/budget/logic";
import type {
  CategoriaOrcamento,
  ItemOrcamento,
  ItemRoteiro,
  Lugar,
  MensagemAssistente,
  ModoOrcamento,
  Preferencias,
  Recomendacao,
  Relatorio,
  Notificacao,
  Transporte,
  Usuario,
  Viagem,
} from "@/types";

type View = "inicio" | "viagem" | "nova" | "ia" | "perfil" | "preferencias" | "admin";
const LIMITES: Record<CategoriaOrcamento, number> = {
  passagem: 0,
  hospedagem: 0,
  visitas: 0,
  alimentacao: 0,
  transporteLocal: 0,
  extras: 0,
};
const menu = [
  { id: "inicio" as View, label: "Visão geral", icon: Home },
  { id: "viagem" as View, label: "Minhas viagens", icon: Map },
  { id: "ia" as View, label: "Assistente Locus", icon: Sparkles },
  { id: "perfil" as View, label: "Meu perfil", icon: CircleUserRound },
];
const dataPadrao = {
  titulo: "Minha próxima viagem",
  origem: "Salvador, BA",
  destino: "",
  dataInicio: "",
  dataFim: "",
  transporte: "aviao" as Transporte,
  modoOrcamento: "aberto" as ModoOrcamento,
  limiteTotal: "",
  mochilao: false,
};

function campo<T = unknown>(obj: unknown, chave: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  return (obj as Record<string, unknown>)[chave] as T | undefined;
}
function tituloViagem(viagem: Viagem): string {
  return viagem.titulo || `Roteiro para ${viagem.destino || "seu próximo destino"}`;
}
function transporteViagem(viagem: Viagem): string {
  return viagem.transporte || String(campo(viagem, "modoTransporte") ?? "aviao").toLowerCase();
}
function dataBr(data?: string): string {
  if (!data) return "Data a definir";
  const [ano, mes, dia] = data.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : data;
}
function totalViagem(viagem: Viagem): number {
  const itensOrcamento = (viagem.orcamento ?? []).reduce((total, item) => total + Number(item.valor || 0), 0);
  const itensRoteiro = (viagem.roteiro ?? []).reduce((total, item) => total + Number(item.valorEstimado || 0), 0);
  return itensOrcamento + itensRoteiro;
}
function itensParaResumo(viagem: Viagem): ItemOrcamento[] {
  const roteiro = (viagem.roteiro ?? [])
    .filter((item) => Number(item.valorEstimado || 0) > 0)
    .map((item) => ({
      id: `roteiro-${item.id}`,
      categoria: "visitas" as CategoriaOrcamento,
      descricao: item.titulo,
      valor: Number(item.valorEstimado || 0),
      natureza: "simulado" as ItemOrcamento["natureza"],
    }));
  return [...(viagem.orcamento ?? []), ...roteiro];
}
function distanciaKm(a: Pick<Lugar, "lat" | "lng">, b: Pick<Lugar, "lat" | "lng">): number {
  const raio = 6371;
  const latitude = ((b.lat - a.lat) * Math.PI) / 180;
  const longitude = ((b.lng - a.lng) * Math.PI) / 180;
  const origem = (a.lat * Math.PI) / 180;
  const destino = (b.lat * Math.PI) / 180;
  const seno = Math.sin(latitude / 2) ** 2 + Math.cos(origem) * Math.cos(destino) * Math.sin(longitude / 2) ** 2;
  return raio * 2 * Math.atan2(Math.sqrt(seno), Math.sqrt(1 - seno));
}
function ordenarLugares(lugares: Lugar[], referencia?: Pick<Lugar, "lat" | "lng">): Lugar[] {
  if (lugares.length < 2) return lugares;
  const primeiro = referencia
    ? [...lugares].sort((a, b) => distanciaKm(referencia, a) - distanciaKm(referencia, b))[0]!
    : lugares[0]!;
  const resultado: Lugar[] = [{
    ...primeiro,
    ...(referencia ? { distanciaKm: distanciaKm(referencia, primeiro) } : {}),
  }];
  const restantes = lugares.filter((item) => item.placeId !== primeiro.placeId);
  while (restantes.length) {
    const ultimo = resultado[resultado.length - 1]!;
    let indice = 0;
    let menor = Number.POSITIVE_INFINITY;
    restantes.forEach((item, atual) => {
      const distancia = distanciaKm(ultimo, item);
      if (distancia < menor) {
        menor = distancia;
        indice = atual;
      }
    });
    const [proximo] = restantes.splice(indice, 1);
    if (proximo) resultado.push({ ...proximo, distanciaKm: menor });
  }
  return resultado;
}
function formatarTransporte(value: string): string {
  return (
    (
      {
        aviao: "Avião",
        onibus: "Ônibus",
        carro: "Carro",
        moto: "Moto",
        particular: "Veículo particular",
      } as Record<string, string>
    )[value] ?? value
  );
}
function rotuloCategoria(value: CategoriaOrcamento): string {
  return CATEGORIAS.find((item) => item.id === value)?.rotulo ?? value;
}

function App() {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [selecionada, setSelecionada] = useState<Viagem | null>(null);
  const [relatorios, setRelatorios] = useState<Relatorio[]>([]);
  const [view, setView] = useState<View>("inicio");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);

  useEffect(() => {
    void usuarioAtual().then(setUsuario);
  }, []);
  useEffect(() => {
    if (!usuario) return;
    void (async () => {
      try {
        const sincronizado = await sincronizarUsuario(usuario);
        if (sincronizado.tipoUsuario === "ADMINISTRADOR") {
          setUsuario((atual) => (atual ? { ...atual, papel: "admin" } : atual));
        }
      } catch (error) {
        setToast(normalizarErro(error).message);
      }
      try {
        const [lista, notificacoesAtuais] = await Promise.all([
          listarViagens(),
          listarNotificacoes().catch(() => []),
        ]);
        setViagens(lista);
        setNotificacoes(notificacoesAtuais);
        if (lista.length > 0) setSelecionada((atual) => atual ?? lista[0]!);
        const porViagem = await Promise.all(
          lista.map((item) => listarRelatorios(item.id).catch(() => [])),
        );
        setRelatorios(porViagem.flat());
      } catch (error) {
        setViagens([]);
        setToast(normalizarErro(error).message);
      }
    })();
  }, [usuario]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function autenticarGoogle() {
    setCarregando(true);
    try {
      const sessao = await entrarComGoogle();
      setUsuario(sessao);
      setToast("Login com Google concluído.");
    } catch (error) {
      setToast(normalizarErro(error).message);
    } finally {
      setCarregando(false);
    }
  }
  async function handleSair() {
    await sair();
    setUsuario(null);
    setViagens([]);
    setSelecionada(null);
    setRelatorios([]);
    setNotificacoes([]);
    setNotificacoesAbertas(false);
    setView("inicio");
  }
  async function abrirViagem(viagem: Viagem) {
    setCarregando(true);
    try {
      setSelecionada(await obterViagem(viagem.id));
    } catch {
      setSelecionada(viagem);
    } finally {
      setCarregando(false);
      setView("viagem");
      setMobileMenu(false);
    }
  }
  async function confirmar(viagem: Viagem) {
    setCarregando(true);
    try {
      const resultado = await confirmarRoteiro(viagem.id, totalViagem(viagem));
      setRelatorios((atuais) => [
        resultado.relatorio,
        ...atuais.filter((item) => item.id !== resultado.relatorio.id),
      ]);
      setToast(
        `Simulação confirmada. Protocolo ${resultado.reserva.protocolo}. O relatório está disponível no seu perfil.`,
      );
      setView("perfil");
    } catch (error) {
      setToast(normalizarErro(error).message);
    } finally {
      setCarregando(false);
    }
  }
  async function adicionarAoRoteiro(recomendacao: Recomendacao) {
    if (!selecionada) {
      setToast("Abra uma viagem para guardar essa sugestão no roteiro.");
      return;
    }
    setCarregando(true);
    try {
      const atualizada = await adicionarRecomendacao(selecionada.id, recomendacao);
      setSelecionada(atualizada);
      setViagens((atuais) => atuais.map((item) => (item.id === atualizada.id ? atualizada : item)));
      setToast(`${recomendacao.titulo} foi adicionado ao seu roteiro.`);
    } catch (error) {
      setToast(normalizarErro(error).message);
    } finally {
      setCarregando(false);
    }
  }
  function navegar(proxima: View) {
    setView(proxima);
    setMobileMenu(false);
  }

  async function alternarNotificacoes() {
    const abrir = !notificacoesAbertas;
    setNotificacoesAbertas(abrir);
    if (!abrir) return;
    try {
      setNotificacoes(await listarNotificacoes());
    } catch {
      setToast("Não foi possível atualizar suas notificações agora.");
    }
  }

  if (!usuario)
    return (
      <LoginPage
        carregando={carregando}
        mensagem={toast}
        onGoogle={() => void autenticarGoogle()}
      />
    );
  return (
    <div className="locus-app">
      <aside className={`locus-sidebar ${mobileMenu ? "is-open" : ""}`}>
        <div className="sidebar-brand">
          <img src="/assets/locus_logo.svg" alt="Locus" />
          <button
            className="icon-button mobile-only"
            aria-label="Fechar menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegação principal">
          {menu.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${view === item.id || (item.id === "viagem" && view === "nova") ? "active" : ""}`}
                onClick={() => navegar(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item muted"
            onClick={() => navegar("preferencias")}
          >
            <Settings2 size={18} />
            <span>Preferências</span>
          </button>
          {usuario.papel === "admin" && (
            <button className="nav-item muted" onClick={() => navegar("admin")}>
              <ShieldCheck size={18} />
              <span>Administração</span>
            </button>
          )}
          <div className="sidebar-user">
            <Avatar nome={usuario.nome} />
            <div>
              <strong>{usuario.nome}</strong>
              <span>{usuario.email}</span>
            </div>
          </div>
          <button className="nav-item muted" onClick={() => void handleSair()}>
            <LogOut size={18} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
      {mobileMenu && (
        <button
          className="sidebar-overlay mobile-only"
          aria-label="Fechar menu"
          onClick={() => setMobileMenu(false)}
        />
      )}
      <main className="locus-main">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            aria-label="Abrir menu"
            onClick={() => setMobileMenu(true)}
          >
            <Menu size={21} />
          </button>
          <div className="topbar-search">
            <Search size={17} />
            <span>Busque destinos, viagens e inspirações</span>
          </div>
          <div className="topbar-actions">
            <div className="notification-wrap">
              <button
                className="icon-button"
                aria-label="Notificações"
                onClick={() => void alternarNotificacoes()}
              >
                <Bell size={19} />
                {notificacoes.some((item) => !item.lida) && <span className="notification-dot" />}
              </button>
              {notificacoesAbertas && (
                <div className="notification-panel">
                  <div className="notification-panel-heading"><div><span className="section-label">Central</span><strong>Notificações</strong></div><button type="button" onClick={() => { void marcarTodasComoLidas().then(() => setNotificacoes((atuais) => atuais.map((item) => ({ ...item, lida: true })))); }}><CheckCheck size={15} /> Ler todas</button></div>
                  {notificacoes.length ? notificacoes.slice(0, 8).map((item) => <button className={`notification-item ${item.lida ? "is-read" : ""}`} type="button" key={item.id} onClick={() => { if (!item.lida) void marcarLida(item.id).then(() => setNotificacoes((atuais) => atuais.map((atual) => atual.id === item.id ? { ...atual, lida: true } : atual))); }}><span className="notification-item-dot" /><span><strong>{item.titulo}</strong><small>{item.texto}</small></span></button>) : <p className="notification-empty">Você ainda não tem novidades.</p>}
                </div>
              )}
            </div>
            <button className="profile-trigger" onClick={() => navegar("perfil")}>
              <Avatar nome={usuario.nome} />
              <span>{usuario.nome.split(" ")[0]}</span>
              <ChevronRight size={15} />
            </button>
          </div>
        </header>
        <div className="page-content">
          {view === "inicio" && (
            <HomeView
              viagens={viagens}
              selecionada={selecionada}
              usuario={usuario}
              relatorios={relatorios}
              onNova={() => navegar("nova")}
              onIA={() => navegar("ia")}
              onAbrir={abrirViagem}
              onPerfil={() => navegar("perfil")}
            />
          )}
          {view === "nova" && (
            <NovaViagemView
              carregando={carregando}
              onCancelar={() => navegar("inicio")}
              onCriar={async (dados) => {
                setCarregando(true);
                try {
                  const criada = await criarViagem(dados);
                  const pronta = await criarRoteiroInicial(criada);
                  setViagens((atuais) => [pronta, ...atuais]);
                  setNotificacoes(await listarNotificacoes().catch(() => []));
                  setSelecionada(pronta);
                  setToast("Viagem criada. Agora vamos montar o seu roteiro.");
                  setView("viagem");
                } catch (error) {
                  setToast(normalizarErro(error).message);
                } finally {
                  setCarregando(false);
                }
              }}
            />
          )}
          {view === "viagem" && (
            <TripView
              viagem={selecionada}
              carregando={carregando}
              onVoltar={() => navegar("inicio")}
              onIA={() => navegar("ia")}
              onConfirmar={() => selecionada && void confirmar(selecionada)}
            />
          )}
          {view === "ia" && (
            <AssistantView
              viagem={selecionada}
              onVoltar={() => navegar(selecionada ? "viagem" : "inicio")}
              onToast={setToast}
              onAdicionar={(recomendacao) => void adicionarAoRoteiro(recomendacao)}
            />
          )}
          {view === "perfil" && (
            <ProfileView
              usuario={usuario}
              viagens={viagens}
              relatorios={relatorios}
              onAbrir={abrirViagem}
              onPreferencias={() => navegar("preferencias")}
              onBaixar={async (relatorio) => {
                try {
                  const blob = await baixarRelatorio(relatorio);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download =
                    campo<string>(relatorio, "nomeArquivo") ?? `locus-${relatorio.protocolo}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (error) {
                  setToast(normalizarErro(error).message);
                }
              }}
            />
          )}
          {view === "preferencias" && <PreferencesView onToast={setToast} />}
          {view === "admin" && usuario.papel === "admin" && <AdminView onToast={setToast} />}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast("")} aria-label="Fechar aviso">
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function LoginPage({
  carregando,
  mensagem,
  onGoogle,
}: {
  carregando: boolean;
  mensagem: string;
  onGoogle: () => void;
}) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [erro, setErro] = useState("");
  async function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailLoading(true);
    try {
      const sessao = await entrar(email, senha);
      window.location.reload();
    } catch (error) {
      setErro(normalizarErro(error).message);
    } finally {
      setEmailLoading(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <div className="story-top">
          <img src="/assets/locus_logo.svg" alt="Locus" />
          <span className="story-badge">
            <span className="status-dot" /> Planejamento inteligente
          </span>
        </div>
        <div className="story-copy">
          <p className="eyebrow">Para onde a sua curiosidade leva?</p>
          <h1>
            Pequenos passos.
            <br />
            <em>Grandes entregas.</em>
          </h1>
          <p>
            Do primeiro “e se...” ao roteiro que faz sentido para você. O Locus combina conversa,
            mapas, orçamento e escolhas reais em uma jornada só.
          </p>
          <div className="story-points">
            <span>
              <Check size={15} /> Gemini para decidir melhor
            </span>
            <span>
              <Check size={15} /> Roteiros por dia
            </span>
            <span>
              <Check size={15} /> Relatório PDF no perfil
            </span>
          </div>
        </div>
        <img className="story-icon" src="/assets/locus_icone.svg" alt="" />
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-logo">
            <img src="/assets/locus_logo.svg" alt="Locus" />
          </div>
          <p className="eyebrow">Seu espaço de viagem</p>
          <h2>Planeje com intenção.</h2>
          <p className="login-lead">
            Entre para continuar seus roteiros, conversar com a IA e guardar cada entrega.
          </p>
          <button className="google-button" onClick={onGoogle} disabled={carregando}>
            <GoogleMark /> {carregando ? "Abrindo o Google..." : "Continuar com Google"}
          </button>
          <div className="login-divider">
            <span>ou use seu acesso Firebase</span>
          </div>
          <form className="email-form" onSubmit={(event) => void handleEmail(event)}>
            <label>
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@exemplo.com"
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder="mínimo de 6 caracteres"
                minLength={6}
                required
              />
            </label>
            {(erro || mensagem) && <p className="form-error">{erro || mensagem}</p>}
            <button className="primary-button full" disabled={emailLoading}>
              {emailLoading ? "Entrando..." : "Entrar com e-mail"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function HomeView({
  viagens,
  selecionada,
  usuario,
  relatorios,
  onNova,
  onIA,
  onAbrir,
  onPerfil,
}: {
  viagens: Viagem[];
  selecionada: Viagem | null;
  usuario: Usuario;
  relatorios: Relatorio[];
  onNova: () => void;
  onIA: () => void;
  onAbrir: (viagem: Viagem) => void;
  onPerfil: () => void;
}) {
  const principal = selecionada ?? viagens[0];
  return (
    <section className="view-stack">
      <div className="welcome-row">
        <div>
          <p className="eyebrow">
            {new Date().toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </p>
          <h1>
            Olá, {usuario.nome.split(" ")[0]}.<br />
            <span>Vamos criar algo memorável?</span>
          </h1>
          <p className="view-subtitle">O melhor roteiro começa com uma boa pergunta.</p>
        </div>
        <button className="primary-button" onClick={onNova}>
          <Plus size={18} /> Nova viagem
        </button>
      </div>
      <div className="metric-grid">
        <Metric
          icon={<MapPin size={19} />}
          label="Viagens planejadas"
          value={String(viagens.length).padStart(2, "0")}
          tone="orange"
        />
        <Metric
          icon={<Sparkles size={19} />}
          label="Roteiros criados"
          value={String(viagens.filter((item) => item.roteiro.length > 0).length).padStart(2, "0")}
          tone="purple"
        />
        <Metric
          icon={<FileText size={19} />}
          label="Relatórios salvos"
          value={String(relatorios.length).padStart(2, "0")}
          tone="green"
        />
      </div>
      <div className="home-grid">
        <div className="main-column">
          {principal ? (
            <article className="featured-trip">
              <div className="featured-top">
                <div>
                  <span className="section-label">Em destaque</span>
                  <h2>{tituloViagem(principal)}</h2>
                  <p>
                    <MapPin size={15} /> {principal.origem} <ArrowRight size={14} />{" "}
                    {principal.destino}
                  </p>
                </div>
                <span className="trip-status">Rascunho</span>
              </div>
              <div className="trip-cover">
                <div className="cover-orb orb-one" />
                <div className="cover-orb orb-two" />
                <div className="cover-content">
                  <span className="cover-kicker">
                    <Globe2 size={14} /> Próxima jornada
                  </span>
                  <strong>{principal.destino || "Seu destino"}</strong>
                  <span>
                    {dataBr(principal.dataInicio)} — {dataBr(principal.dataFim)}
                  </span>
                </div>
                <Navigation className="cover-compass" size={84} />
              </div>
              <div className="featured-footer">
                <div className="trip-facts">
                  <span>
                    <CalendarDays size={16} /> {dataBr(principal.dataInicio)}
                  </span>
                  <span>
                    <Compass size={16} /> {formatarTransporte(transporteViagem(principal))}
                  </span>
                  <span>
                    <WalletCards size={16} />{" "}
                    {totalViagem(principal) ? brl(totalViagem(principal)) : "Orçamento aberto"}
                  </span>
                </div>
                <button className="text-button" onClick={() => onAbrir(principal)}>
                  Abrir planejamento <ArrowRight size={16} />
                </button>
              </div>
            </article>
          ) : (
            <EmptyTrip onNova={onNova} />
          )}
          <div className="section-heading">
            <div>
              <span className="section-label">Seu espaço</span>
              <h2>Atalhos para continuar</h2>
            </div>
            <button className="text-button" onClick={onPerfil}>
              Ver perfil <ArrowRight size={16} />
            </button>
          </div>
          <div className="action-grid">
            <ActionCard
              icon={<Sparkles />}
              title="Conversar com a IA"
              text="Transforme uma ideia solta em possibilidades reais."
              tone="purple"
              onClick={onIA}
            />
            <ActionCard
              icon={<Map />}
              title="Explorar destinos"
              text="Pesquise lugares, mapas e pontos de interesse."
              tone="green"
              onClick={onIA}
            />
            <ActionCard
              icon={<WalletCards />}
              title="Revisar orçamento"
              text="Confira limites, estimativas e escolhas do roteiro."
              tone="orange"
              onClick={() => (principal ? onAbrir(principal) : onNova)}
            />
          </div>
        </div>
        <aside className="right-column">
          <div className="side-card">
            <div className="side-card-heading">
              <div>
                <span className="section-label">Atualizações</span>
                <h3>Seu ritmo, seu roteiro</h3>
              </div>
              <Bell size={18} />
            </div>
            <div className="timeline-note">
              <span className="timeline-line" />
              <div>
                <strong>Seu espaço está pronto</strong>
                <p>Suas viagens, escolhas e entregas ficam organizadas aqui.</p>
              </div>
            </div>
            <div className="timeline-note">
              <span className="timeline-line purple" />
              <div>
                <strong>Assistente pronto</strong>
                <p>Peça alternativas, compare e ajuste sem recomeçar.</p>
              </div>
            </div>
            <div className="timeline-note">
              <span className="timeline-line green" />
              <div>
                <strong>Relatórios no perfil</strong>
                <p>Depois da simulação, o PDF fica guardado para você.</p>
              </div>
            </div>
          </div>
          <div className="side-card inspiration-card">
            <Heart size={18} />
            <span className="section-label">Uma ideia para começar</span>
            <p>“Quero uma viagem tranquila, com lugares bons para fotografar e pouca caminhada.”</p>
            <button className="text-button" onClick={onIA}>
              Levar para a IA <ArrowRight size={16} />
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function NovaViagemView({
  onCriar,
  onCancelar,
  carregando,
}: {
  onCriar: (
    dados: Pick<
      Viagem,
      | "titulo"
      | "origem"
      | "destino"
      | "dataInicio"
      | "dataFim"
      | "transporte"
      | "modoOrcamento"
      | "limites"
      | "mochilao"
    >,
  ) => Promise<void>;
  onCancelar: () => void;
  carregando: boolean;
}) {
  const [form, setForm] = useState(dataPadrao);
  function update(key: keyof typeof form, value: string) {
    setForm((atual) => ({ ...atual, [key]: value }));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCriar({
      titulo: form.titulo,
      origem: form.origem,
      destino: form.destino,
      dataInicio: form.dataInicio,
      dataFim: form.dataFim,
      transporte: form.transporte,
      modoOrcamento: form.modoOrcamento,
      limites: { ...LIMITES, extras: Number(form.limiteTotal) || 0 },
      mochilao: form.mochilao,
    });
  }
  return (
    <section className="view-stack narrow-view">
      <div className="back-row">
        <button className="back-button" onClick={onCancelar}>
          <ArrowRight className="rotate-180" size={16} /> Voltar
        </button>
        <span className="step-caption">01 / 02 · Base da viagem</span>
      </div>
      <div className="form-hero">
        <div>
          <p className="eyebrow">Comece pelo essencial</p>
          <h1>Onde a sua próxima história começa?</h1>
          <p className="view-subtitle">
            Você poderá editar o roteiro, os itens e o orçamento depois.
          </p>
        </div>
        <div className="form-hero-icon">
          <Compass size={34} />
        </div>
      </div>
      <form className="trip-form surface-panel" onSubmit={(event) => void submit(event)}>
        <div className="form-section">
          <span className="section-label">Identidade</span>
          <div className="form-grid">
            <Field
              label="Nome da viagem"
              value={form.titulo}
              onChange={(value) => update("titulo", value)}
              placeholder="Ex.: Férias em família"
            />
            <LocationField
              label="De onde você sai?"
              value={form.origem}
              onChange={(value) => update("origem", value)}
              placeholder="Cidade ou aeroporto"
            />
            <LocationField
              label="Para onde você vai?"
              value={form.destino}
              onChange={(value) => update("destino", value)}
              placeholder="Cidade, país ou região"
              wide
            />
          </div>
        </div>
        <div className="form-section">
          <span className="section-label">Quando e como</span>
          <div className="form-grid">
            <Field
              label="Data de ida"
              type="date"
              value={form.dataInicio}
              onChange={(value) => update("dataInicio", value)}
            />
            <Field
              label="Data de volta"
              type="date"
              value={form.dataFim}
              onChange={(value) => update("dataFim", value)}
            />
            <SelectField
              label="Como você quer ir?"
              value={form.transporte}
              onChange={(value) => update("transporte", value)}
              options={[
                ["aviao", "Avião"],
                ["onibus", "Ônibus"],
                ["carro", "Carro"],
                ["moto", "Moto"],
                ["particular", "Veículo particular"],
              ]}
            />
          </div>
        </div>
        <div className="form-section">
          <span className="section-label">Orçamento</span>
          <div className="form-grid">
            <SelectField
              label="Modo de planejamento"
              value={form.modoOrcamento}
              onChange={(value) => update("modoOrcamento", value)}
              options={[
                ["aberto", "Aberto — decidir aos poucos"],
                ["fixo", "Fixo — respeitar um limite"],
              ]}
            />
            <Field
              label="Limite total (opcional)"
              type="number"
              value={form.limiteTotal}
              onChange={(value) => update("limiteTotal", value)}
              placeholder="R$ 0,00"
            />
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={form.mochilao} onChange={(event) => setForm((atual) => ({ ...atual, mochilao: event.target.checked }))} /><span>É um mochilão com vários países ou cidades no mesmo período</span></label>
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={carregando || !form.destino || !form.dataInicio || !form.dataFim || (form.modoOrcamento === "fixo" && Number(form.limiteTotal) <= 0)}
          >
            {carregando ? "Criando..." : "Criar viagem"} <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </section>
  );
}

function TripView({
  viagem,
  onVoltar,
  onIA,
  onConfirmar,
  carregando,
}: {
  viagem: Viagem | null;
  onVoltar: () => void;
  onIA: () => void;
  onConfirmar: () => void;
  carregando: boolean;
}) {
  const [aba, setAba] = useState<"roteiro" | "orcamento" | "resumo">("roteiro");
  if (!viagem) return <EmptyTrip onNova={onVoltar} />;
  const itens = viagem.roteiro ?? [];
  const dias = [...new Set(itens.map((item) => item.dia))];
  const resumo = resumirOrcamento(
    itensParaResumo(viagem),
    viagem.limites ?? LIMITES,
    viagem.modoOrcamento ?? "aberto",
  );
  return (
    <section className="view-stack">
      <div className="back-row">
        <button className="back-button" onClick={onVoltar}>
          <ArrowRight className="rotate-180" size={16} /> Todas as viagens
        </button>
        <span className="trip-status">
          <span className="status-dot" /> Planejamento em andamento
        </span>
      </div>
      <div className="trip-heading">
        <div>
          <p className="eyebrow">Roteiro personalizado</p>
          <h1>{tituloViagem(viagem)}</h1>
          <p className="view-subtitle">
            <MapPin size={15} /> {viagem.origem} <ArrowRight size={14} /> {viagem.destino}{" "}
            <span className="bullet">·</span> {dataBr(viagem.dataInicio)} a {dataBr(viagem.dataFim)}
          </p>
        </div>
        <div className="heading-actions">
          <button className="secondary-button" onClick={onIA}>
            <Sparkles size={17} /> Ajustar com IA
          </button>
          <button
            className="primary-button"
            onClick={onConfirmar}
            disabled={carregando || itens.length === 0}
          >
            {carregando ? "Confirmando..." : "Confirmar roteiro"} <Check size={17} />
          </button>
        </div>
      </div>
      <div className="trip-tabs">
        {[
          ["roteiro", "Roteiro", Map],
          ["orcamento", "Orçamento", WalletCards],
          ["resumo", "Resumo final", FileText],
        ].map(([id, label, Icon]) => (
          <button
            key={String(id)}
            className={aba === id ? "active" : ""}
            onClick={() => setAba(id as typeof aba)}
          >
            {typeof Icon === "function" && <Icon size={17} />} {String(label)}
          </button>
        ))}
      </div>
      {aba === "roteiro" && (
        <div className="itinerary-layout">
          <div className="itinerary-main">
            {dias.length ? (
              dias.map((dia) => (
                <div className="day-card" key={dia}>
                  <div className="day-marker">
                    <span>0{dia}</span>
                    <div>
                      <strong>Dia {dia}</strong>
                      <small>{dataBr(addDays(viagem.dataInicio, dia - 1))}</small>
                    </div>
                  </div>
                  <div className="day-items">
                    {itens
                      .filter((item) => item.dia === dia)
                      .map((item) => (
                        <ItineraryItem key={item.id} item={item} />
                      ))}
                    <button className="add-item-button" onClick={onIA}>
                      <Plus size={16} /> Pedir uma sugestão para este dia
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <EmptyItinerary onIA={onIA} />
            )}
          </div>
          <aside className="trip-summary">
            <SummaryCard viagem={viagem} resumo={resumo} />
          </aside>
        </div>
      )}
      {aba === "orcamento" && <BudgetView viagem={viagem} resumo={resumo} />}
      {aba === "resumo" && (
        <FinalSummary
          viagem={viagem}
          resumo={resumo}
          onConfirmar={onConfirmar}
          carregando={carregando}
        />
      )}
    </section>
  );
}

function AssistantView({
  viagem,
  onVoltar,
  onToast,
  onAdicionar,
}: {
  viagem: Viagem | null;
  onVoltar: () => void;
  onToast: (value: string) => void;
  onAdicionar: (recomendacao: Recomendacao) => void;
}) {
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([
    {
      id: "welcome",
      autor: "assistente",
      texto: `Oi! Eu sou o assistente do Locus. ${viagem ? `Vamos deixar “${tituloViagem(viagem)}” mais interessante?` : "Me conte o que você imagina para a sua próxima viagem."}`,
      criadaEm: new Date().toISOString(),
    },
  ]);
  const [texto, setTexto] = useState("");
  const [busca, setBusca] = useState("");
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [streetViews, setStreetViews] = useState<Record<string, StreetViewMeta>>({});
  const [streetViewSelecionado, setStreetViewSelecionado] = useState<{ lugar: Lugar; meta: StreetViewMeta; recomendacao?: Recomendacao } | null>(null);
  const [preferencias, setPreferencias] = useState<Preferencias | null>(null);
  const [hospedagemBase, setHospedagemBase] = useState<{ nome: string; lat: number; lng: number } | null>(null);
  const [rota, setRota] = useState<Trecho[]>([]);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    void lerPreferenciasBackend().then(setPreferencias).catch(() => undefined);
  }, []);
  const modoOrcamento: ModoOrcamento = viagem?.modoOrcamento ?? preferencias?.modoOrcamento ?? "aberto";
  const limiteViagem = viagem ? Object.values(viagem.limites).reduce((total, valor) => total + Number(valor || 0), 0) : 0;
  const limitePreferencias = Number(preferencias?.limites.extras || 0);
  const limite = modoOrcamento === "fixo"
    ? (limiteViagem > 0 ? limiteViagem : limitePreferencias > 0 ? limitePreferencias : undefined)
    : undefined;
  const acumulado = viagem ? totalViagem(viagem) : 0;
  async function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!texto.trim() || enviando) return;
    const pergunta = texto.trim();
    setTexto("");
    const user: MensagemAssistente = {
      id: `u-${Date.now()}`,
      autor: "usuario",
      texto: pergunta,
      criadaEm: new Date().toISOString(),
    };
    setMensagens((atuais) => [...atuais, user]);
    setEnviando(true);
    try {
      const resposta = await perguntarGemini([...mensagens, user], pergunta, {
        modoOrcamento,
        limite,
        acumulado,
        origem: viagem?.origem || preferencias?.origem,
        destino: viagem?.destino,
        dataInicio: viagem?.dataInicio || preferencias?.dataInicio,
        dataFim: viagem?.dataFim || preferencias?.dataFim,
        transporte: viagem?.transporte || preferencias?.transporte,
        interesses: preferencias?.interesses,
        ritmo: preferencias?.ritmo,
        hospedagem: preferencias?.hospedagem,
        ...(hospedagemBase ? { hospedagemBase: `${hospedagemBase.nome} (${hospedagemBase.lat}, ${hospedagemBase.lng})` } : {}),
        roteiro: viagem?.roteiro.map((item) => `dia ${item.dia}: ${item.titulo}`).join(" | "),
      });
      setMensagens((atuais) => [...atuais, resposta]);
      const consultas = resposta.consultas?.length ? resposta.consultas : [pergunta];
      const destinoBusca = viagem?.destino || preferencias?.destino || "";
      const contextoProximidade = hospedagemBase
        ? ` próximo à hospedagem ${hospedagemBase.nome}`
        : "";
      const consultasBusca = consultas.map((consulta) => {
        const consultaComBase = `${consulta}${contextoProximidade}`;
        return destinoBusca && !consultaComBase.toLowerCase().includes(destinoBusca.toLowerCase())
          ? `${consultaComBase} em ${destinoBusca}`
          : consultaComBase;
      });
      let falhasBusca = 0;
      const resultados = await Promise.all(
        consultasBusca.slice(0, 3).map((consulta) =>
          buscaTextual(consulta).catch(() => {
            falhasBusca += 1;
            return { lugares: [], fallback: false };
          }),
        ),
      );
      const encontrados = resultados.flatMap((item) => item.lugares);
      let respostaFinal = resposta;
      if (encontrados.length) {
        const unicos = [...new Map(encontrados.map((item) => [item.placeId, item])).values()];
        const proximos = hospedagemBase
          ? unicos.filter((lugar) => distanciaKm(hospedagemBase, lugar) <= 20)
          : unicos;
        const organizados = ordenarLugares(proximos, hospedagemBase ?? undefined).slice(0, 12);
        setLugares(organizados);
        setStreetViews({});
        if (organizados.length && (organizados.length > 1 || hospedagemBase)) {
          const pontosRota = [
            ...(hospedagemBase ? [{ lat: hospedagemBase.lat, lng: hospedagemBase.lng, nome: hospedagemBase.nome }] : []),
            ...organizados.slice(0, 6).map((item) => ({ lat: item.lat, lng: item.lng, nome: item.nome })),
          ];
          const trechos = await calcularRota(pontosRota).catch(() => []);
          setRota(trechos);
        } else {
          setRota([]);
        }
        const diasDeViagem = viagem?.dataInicio && viagem?.dataFim
          ? Math.max(1, Math.floor((new Date(`${viagem.dataFim}T12:00:00`).getTime() - new Date(`${viagem.dataInicio}T12:00:00`).getTime()) / 86400000) + 1)
          : 1;
        const recomendacoesReais: Recomendacao[] = organizados.slice(0, 6).map((lugar, index) => ({
          id: `lugar-${lugar.placeId}`,
          placeId: lugar.placeId,
          tipo: "lugar",
          titulo: lugar.nome,
          resumo: `${lugar.categoria} · ${lugar.endereco || "localização consultada"}${lugar.avaliacao ? ` · ★ ${lugar.avaliacao.toFixed(1)}` : ""}`,
          justificativa: `${hospedagemBase ? `${distanciaKm(hospedagemBase, lugar).toFixed(1)} km da hospedagem ${hospedagemBase.nome}. ` : ""}Encontrado no Google Places; confira o Street View antes de adicionar.`,
          evidencia: { fonte: lugar.fonte, consultadoEm: lugar.consultadoEm },
          categoria: "visitas",
          natureza: "observado",
          ...(lugar.avaliacao ? { avaliacao: lugar.avaliacao } : {}),
          ...(lugar.endereco ? { endereco: lugar.endereco } : {}),
          ...(Number.isFinite(lugar.lat) ? { lat: lugar.lat } : {}),
          ...(Number.isFinite(lugar.lng) ? { lng: lugar.lng } : {}),
          categoriaLocal: lugar.categoria,
          ...(hospedagemBase ? { distanciaKm: distanciaKm(hospedagemBase, lugar) } : {}),
          dia: Math.min(diasDeViagem, Math.floor(index / 3) + 1),
        }));
        respostaFinal = {
          ...resposta,
          texto: organizados.length
            ? `${resposta.texto} Encontrei ${organizados.length} locais reais${hospedagemBase ? ` em até 20 km da hospedagem ${hospedagemBase.nome}` : ""}. Veja a avaliação, abra o Street View e adicione somente os que desejar.`
            : `Não encontrei pontos turísticos dentro de 20 km da hospedagem ${hospedagemBase?.nome ?? "selecionada"}. Vou evitar sugerir locais distantes; pesquise um bairro ou local específico no campo ao lado.`,
          ...(recomendacoesReais.length ? { recomendacoes: recomendacoesReais } : {}),
        };
      } else {
        respostaFinal = {
          ...resposta,
          texto: falhasBusca
            ? `${resposta.texto} Não consegui consultar o Google Places agora. Tente novamente em alguns segundos ou use a busca ao lado.`
            : `${resposta.texto} Não encontrei resultados reais para essa busca no destino informado. Tente citar uma praia, museu, bairro ou ponto turístico específico.`,
        };
        delete respostaFinal.recomendacoes;
      }
      setMensagens((atuais) => atuais.map((item) => item.id === resposta.id ? respostaFinal : item));
    } catch (error) {
      onToast(normalizarErro(error).message);
    } finally {
      setEnviando(false);
    }
  }
  async function pesquisar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busca.trim()) return;
    try {
      const destinoBusca = viagem?.destino || preferencias?.destino || "";
      const resultado = await buscaTextual(destinoBusca ? `${busca} em ${destinoBusca}` : busca);
      const proximos = hospedagemBase
        ? resultado.lugares.filter((lugar) => distanciaKm(hospedagemBase, lugar) <= 20)
        : resultado.lugares;
      const organizados = ordenarLugares(proximos, hospedagemBase ?? undefined);
      setLugares(organizados);
      if (!organizados.length) {
        onToast(hospedagemBase
          ? "Nenhum resultado ficou até 20 km da hospedagem escolhida. Pesquise outro local ou bairro próximo."
          : "Nenhum local real foi encontrado para essa busca.");
      }
      if (organizados.length && (organizados.length > 1 || hospedagemBase)) {
        const pontosRota = [
          ...(hospedagemBase ? [{ lat: hospedagemBase.lat, lng: hospedagemBase.lng, nome: hospedagemBase.nome }] : []),
          ...organizados.slice(0, 6).map((item) => ({ lat: item.lat, lng: item.lng, nome: item.nome })),
        ];
        const trechos = await calcularRota(pontosRota).catch(() => []);
        setRota(trechos);
      } else {
        setRota([]);
      }
      setStreetViews({});
    } catch (error) {
      onToast(normalizarErro(error).message);
    }
  }
  async function revisarLugar(lugar: Lugar, recomendacao?: Recomendacao) {
    onToast(`Consultando o Street View de ${lugar.nome}...`);
    try {
      const resultado = await streetViewMetadata(lugar.lat, lugar.lng);
      setStreetViews((atual) => ({ ...atual, [lugar.placeId]: resultado }));
      setStreetViewSelecionado({ lugar, meta: resultado, ...(recomendacao ? { recomendacao } : {}) });
      onToast(
        resultado.status === "OK"
          ? `${lugar.nome} está pronto para você conferir no mapa e no Street View.`
          : `O Street View não encontrou uma imagem disponível para ${lugar.nome}.`,
      );
    } catch (error) {
      const fallback: StreetViewMeta = { status: "FALLBACK", mapaUrl: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lugar.lat},${lugar.lng}` };
      setStreetViews((atual) => ({ ...atual, [lugar.placeId]: fallback }));
      setStreetViewSelecionado({ lugar, meta: fallback, ...(recomendacao ? { recomendacao } : {}) });
      onToast("A visualização foi aberta no Google Maps. A imagem depende da disponibilidade do ponto.");
    }
  }
  function distanciaTexto(lugar: Lugar): string {
    const referencia = hospedagemBase ?? lugares[0];
    if (!referencia || ("placeId" in referencia && referencia.placeId === lugar.placeId)) return "Ponto de referência";
    const distancia = distanciaKm(referencia, lugar);
    const leitura = distancia <= 10 ? "perto" : distancia <= 30 ? "viável com deslocamento" : "longe; melhor separar em outro dia";
    return `${distancia.toFixed(1)} km ${hospedagemBase ? "da hospedagem" : "do primeiro ponto"} · ${leitura}`;
  }
  function adicionarLugar(lugar: Lugar) {
    if (!streetViews[lugar.placeId]) {
      onToast("Confira o Street View antes de adicionar este lugar ao roteiro.");
      void revisarLugar(lugar);
      return;
    }
    adicionarRecomendacaoControlada({
      id: `lugar-${lugar.placeId}`,
      tipo: "lugar",
      titulo: lugar.nome,
      resumo: `${lugar.categoria} · ${lugar.endereco}`,
      justificativa: "Lugar consultado no Google Places e escolhido por você.",
      evidencia: { fonte: lugar.fonte, consultadoEm: lugar.consultadoEm },
      placeId: lugar.placeId,
      ...(lugar.avaliacao ? { avaliacao: lugar.avaliacao } : {}),
      ...(lugar.endereco ? { endereco: lugar.endereco } : {}),
      lat: lugar.lat,
      lng: lugar.lng,
      categoriaLocal: lugar.categoria,
    });
  }
  function adicionarRecomendacaoControlada(recomendacao: Recomendacao) {
    if (limite != null && Number(recomendacao.valor || 0) > Math.max(0, limite - acumulado)) {
      onToast("Essa recomendação ultrapassa o saldo restante do seu orçamento.");
      return;
    }
    if (recomendacao.tipo === "hospedagem" && recomendacao.lat != null && recomendacao.lng != null) {
      setHospedagemBase({ nome: recomendacao.titulo, lat: recomendacao.lat, lng: recomendacao.lng });
      onToast(`Hospedagem escolhida. As próximas recomendações ficarão em até 20 km dela.`);
    }
    onAdicionar(recomendacao);
  }
  return (
    <section className="view-stack">
      <div className="back-row">
        <button className="back-button" onClick={onVoltar}>
          <ArrowRight className="rotate-180" size={16} /> Voltar
        </button>
        <span className="ai-live">
          <span className="pulse-dot" /> Seu assistente de viagem
        </span>
      </div>
      <div className="assistant-heading">
        <div>
          <p className="eyebrow">Conversa contínua</p>
          <h1>Ideias que encontram um caminho.</h1>
          <p className="view-subtitle">
            Pergunte, compare e refine. A IA mantém o contexto enquanto você decide.
          </p>
        </div>
        <div className="assistant-heading-mark">
          <Sparkles size={28} />
        </div>
      </div>
      <div className="assistant-layout">
        <div className="chat-panel">
          <div className="chat-header">
            <div className="assistant-avatar">
              <Sparkles size={18} />
            </div>
            <div>
              <strong>Assistente Locus</strong>
              <span>Respostas apoiadas por dados consultados</span>
            </div>
            <span className="chat-online">online</span>
          </div>
          <div className="chat-messages">
            {mensagens.map((mensagem) => (
              <div
                key={mensagem.id}
                className={`message-row ${mensagem.autor === "usuario" ? "from-user" : "from-ai"}`}
              >
                <div className="message-bubble">
                  <p>{mensagem.texto}</p>
                  {mensagem.recomendacoes?.map((recomendacao) => (
                    <div className="recommendation" key={recomendacao.id}>
                      <div>
                        <strong>{recomendacao.titulo}</strong>
                        <span>{recomendacao.resumo}</span>
                        <small>
                          {recomendacao.avaliacao ? `★ ${recomendacao.avaliacao.toFixed(1)} · ` : ""}
                          {recomendacao.categoriaLocal ? `${recomendacao.categoriaLocal} · ` : ""}
                          {recomendacao.dia ? `Dia ${recomendacao.dia} · ` : ""}
                          {recomendacao.distanciaKm != null ? `${recomendacao.distanciaKm.toFixed(1)} km da hospedagem · ` : ""}
                          {recomendacao.justificativa} · {recomendacao.evidencia.fonte}
                          {recomendacao.valor ? ` · ${brl(recomendacao.valor)}` : ""}
                        </small>
                      </div>
                      <button type="button" className="recommendation-action"
                        onClick={() => {
                          const lugar = recomendacao.placeId
                            ? lugares.find((item) => item.placeId === recomendacao.placeId)
                            : undefined;
                          if (lugar) void revisarLugar(lugar, recomendacao);
                          else onToast("Este local não está mais disponível. Faça a busca novamente para consultar o Street View.");
                        }}
                      >
                        <Eye size={15} /> Visualizar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {enviando && (
              <div className="message-row from-ai">
                <div className="message-bubble typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
          </div>
          <form className="chat-input" onSubmit={(event) => void enviar(event)}>
            <input
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              placeholder="Ex.: quero um dia tranquilo perto do mar..."
            />
            <button aria-label="Enviar mensagem" disabled={enviando || !texto.trim()}>
              <ArrowRight size={19} />
            </button>
          </form>
        </div>
        <aside className="assistant-side">
          <PlanningFlow
            viagem={viagem}
            etapaInicial="passagem"
            limite={limite}
            acumulado={acumulado}
            onToast={onToast}
            onAdicionar={adicionarRecomendacaoControlada}
          />
          <div className="side-card search-card">
            <div className="side-card-heading">
              <div>
                <span className="section-label">Explorar</span>
                <h3>Lugares para considerar</h3>
              </div>
              <MapPin size={18} />
            </div>
            <form className="place-search" onSubmit={(event) => void pesquisar(event)}>
              <Search size={16} />
              <input
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Pesquisar um lugar"
              />
            </form>
            {lugares.length ? (
              <>
                <MapPreview lugares={lugares.slice(0, 4)} />
                <div className="place-results">
                  {lugares.slice(0, 4).map((lugar) => (
                    <div
                      key={lugar.placeId}
                      className="place-result"
                    >
                      <span className="place-icon">
                        <MapPin size={15} />
                      </span>
                      <span>
                        <strong>{lugar.nome}</strong>
                        <small>
                          {lugar.categoria}{lugar.avaliacao ? ` · ★ ${lugar.avaliacao.toFixed(1)}` : ""} · {distanciaTexto(lugar)}
                        </small>
                      </span>
                      <div className="place-actions">
                        <button type="button" onClick={() => void revisarLugar(lugar)}>Street View</button>
                        <button type="button" onClick={() => adicionarLugar(lugar)}>{streetViews[lugar.placeId] ? "Adicionar" : "Ver antes"}</button>
                      </div>
                    </div>
                  ))}
                </div>
                {rota.length > 0 && (
                  <div className="route-preview">
                    <strong>Rota sugerida por proximidade</strong>
                    {rota.map((trecho) => <span key={`${trecho.de}-${trecho.para}`}>{trecho.de} → {trecho.para}: {trecho.km.toFixed(1)} km · {trecho.minutos} min</span>)}
                  </div>
                )}
                {lugares.slice(0, 4).map((lugar) => {
                  const streetView = streetViews[lugar.placeId];
                  if (!streetView) return null;
                  return (
                    <div className="street-view-preview" key={`${lugar.placeId}-street-view`}>
                      <div>
                        <strong>Antes de escolher: {lugar.nome}</strong>
                        <small>
                          {streetView.status === "OK"
                            ? "Imagem consultada no Google Street View"
                            : "Sem imagem disponível para este ponto"}
                        </small>
                      </div>
                      {streetView.imagemUrl && (
                        <img src={streetView.imagemUrl} alt={`Street View de ${lugar.nome}`} />
                      )}
                      {streetView.mapaUrl && <a href={streetView.mapaUrl} target="_blank" rel="noreferrer">Abrir no Google Street View</a>}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="search-empty">
                <MapPin size={20} />
                <p>Pesquise praias, museus, restaurantes, hotéis e pontos turísticos.</p>
              </div>
            )}
          </div>
          <div className="side-card context-card">
            <span className="section-label">Contexto desta conversa</span>
            <div className="context-tags">
              <span>Preferências</span>
              <span>Datas</span>
              <span>Orçamento</span>
              <span>Ritmo</span>
            </div>
            <p>
              A resposta da IA é um apoio à decisão. Confirme sempre os dados da oferta antes da
              simulação.
            </p>
          </div>
        </aside>
      </div>
      {streetViewSelecionado && (
        <div className="offer-modal-backdrop" role="dialog" aria-modal="true" aria-label="Street View do local">
          <div className="offer-modal street-view-modal">
            <button className="offer-modal-close" type="button" onClick={() => setStreetViewSelecionado(null)} aria-label="Fechar"><X size={17} /></button>
            <span className="section-label">Antes de adicionar</span>
            <h3>{streetViewSelecionado.lugar.nome}</h3>
            {streetViewSelecionado.meta.imagemUrl ? <img className="street-view-modal-image" src={streetViewSelecionado.meta.imagemUrl} alt={`Street View de ${streetViewSelecionado.lugar.nome}`} /> : <iframe className="street-view-frame" src={streetViewSelecionado.meta.mapaUrl} title={`Street View de ${streetViewSelecionado.lugar.nome}`} loading="lazy" />}
            <p>{streetViewSelecionado.lugar.endereco || "Local consultado no mapa"}</p>
            <div className="street-view-details">
              <span>{streetViewSelecionado.lugar.categoria}</span>
              {streetViewSelecionado.lugar.avaliacao ? <span>★ {streetViewSelecionado.lugar.avaliacao.toFixed(1)} no Google</span> : <span>Avaliação não informada</span>}
              {streetViewSelecionado.lugar.aberto != null && <span>{streetViewSelecionado.lugar.aberto ? "Aberto agora" : "Fechado agora"}</span>}
            </div>
            <div className="offer-modal-actions"><a className="secondary-button" href={streetViewSelecionado.meta.mapaUrl} target="_blank" rel="noreferrer">Abrir no Google Maps</a><button className="primary-button" type="button" onClick={() => { adicionarRecomendacaoControlada({ id: `lugar-${streetViewSelecionado.lugar.placeId}`, placeId: streetViewSelecionado.lugar.placeId, tipo: "lugar", titulo: streetViewSelecionado.lugar.nome, resumo: `${streetViewSelecionado.lugar.categoria} · ${streetViewSelecionado.lugar.endereco}`, justificativa: "Lugar consultado no Google Places e conferido no Street View.", evidencia: { fonte: streetViewSelecionado.lugar.fonte, consultadoEm: streetViewSelecionado.lugar.consultadoEm }, ...(streetViewSelecionado.lugar.avaliacao ? { avaliacao: streetViewSelecionado.lugar.avaliacao } : {}), endereco: streetViewSelecionado.lugar.endereco, lat: streetViewSelecionado.lugar.lat, lng: streetViewSelecionado.lugar.lng, categoriaLocal: streetViewSelecionado.lugar.categoria, ...(streetViewSelecionado.recomendacao?.dia ? { dia: streetViewSelecionado.recomendacao.dia } : {}) }); setStreetViewSelecionado(null); }}><Plus size={15} /> Adicionar ao roteiro</button></div>
          </div>
        </div>
      )}
    </section>
  );
}

function ProfileView({
  usuario,
  viagens,
  relatorios,
  onAbrir,
  onPreferencias,
  onBaixar,
}: {
  usuario: Usuario;
  viagens: Viagem[];
  relatorios: Relatorio[];
  onAbrir: (viagem: Viagem) => void;
  onPreferencias: () => void;
  onBaixar: (relatorio: Relatorio) => Promise<void>;
}) {
  return (
    <section className="view-stack">
      <div className="profile-hero">
        <div className="profile-hero-avatar">
          <Avatar nome={usuario.nome} large />
        </div>
        <div>
          <p className="eyebrow">Área pessoal</p>
          <h1>{usuario.nome}</h1>
          <p className="view-subtitle">
            {usuario.email} <span className="bullet">·</span> Viajante Locus
          </p>
        </div>
        <button className="secondary-button profile-edit" onClick={onPreferencias}>
          <Settings2 size={17} /> Preferências
        </button>
      </div>
      <div className="profile-grid">
        <div className="profile-main">
          <div className="section-heading">
            <div>
              <span className="section-label">Histórico</span>
              <h2>Minhas viagens</h2>
            </div>
            <span className="count-pill">{viagens.length}</span>
          </div>
          {viagens.length ? (
            <div className="profile-trips">
              {viagens.map((viagem) => (
                <button className="profile-trip" key={viagem.id} onClick={() => onAbrir(viagem)}>
                  <span className="profile-trip-icon">
                    <MapPin size={18} />
                  </span>
                  <span>
                    <strong>{tituloViagem(viagem)}</strong>
                    <small>
                      {viagem.destino} · {dataBr(viagem.dataInicio)} a {dataBr(viagem.dataFim)}
                    </small>
                  </span>
                  <ChevronRight size={17} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyTrip onNova={() => undefined} />
          )}
        </div>
        <div className="profile-main">
          <div className="section-heading">
            <div>
              <span className="section-label">Entregas</span>
              <h2>Relatórios em PDF</h2>
            </div>
            <FileText size={20} />
          </div>
          {relatorios.length ? (
            <div className="report-list">
              {relatorios.map((relatorio) => (
                <div className="report-item" key={relatorio.id}>
                  <span className="report-icon">
                    <FileText size={18} />
                  </span>
                  <div>
                    <strong>{relatorio.protocolo || `Relatório ${relatorio.id}`}</strong>
                    <small>
                      Gerado em{" "}
                      {new Date(
                        relatorio.geradoEm || String(campo(relatorio, "dataGeracao") ?? ""),
                      ).toLocaleDateString("pt-BR")}
                    </small>
                  </div>
                  <button
                    className="download-button"
                    onClick={() => void onBaixar(relatorio)}
                    aria-label="Baixar relatório"
                  >
                    <Download size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="report-empty">
              <FileText size={24} />
              <strong>Nenhum relatório ainda</strong>
              <p>Depois de confirmar uma simulação, o PDF completo da viagem aparecerá aqui.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
function SummaryCard({
  viagem,
  resumo,
}: {
  viagem: Viagem;
  resumo: ReturnType<typeof resumirOrcamento>;
}) {
  return (
    <div className="summary-card">
      <div className="summary-title">
        <span className="section-label">Visão geral</span>
        <WalletCards size={18} />
      </div>
      <strong className="summary-total">{resumo.total ? brl(resumo.total) : "Aberto"}</strong>
      <span className="summary-caption">estimativa acumulada</span>
      <div className="summary-bars">
        {resumo.categorias.slice(0, 4).map((item) => (
          <div key={item.categoria} className="bar-row">
            <span>{rotuloCategoria(item.categoria)}</span>
            <div>
              <i
                style={{
                  width: `${Math.min(100, item.subtotal && resumo.total ? (item.subtotal / resumo.total) * 100 : 4)}%`,
                }}
              />
            </div>
            <b>{item.subtotal ? brl(item.subtotal) : "—"}</b>
          </div>
        ))}
      </div>
      <div className="summary-divider" />
      <div className="summary-meta">
        <span>
          <Compass size={15} /> {formatarTransporte(transporteViagem(viagem))}
        </span>
        <span>
          <CalendarDays size={15} /> {dataBr(viagem.dataInicio)}
        </span>
      </div>
    </div>
  );
}
function BudgetView({
  viagem,
  resumo,
}: {
  viagem: Viagem;
  resumo: ReturnType<typeof resumirOrcamento>;
}) {
  return (
    <div className="budget-page">
      <div className="budget-total surface-panel">
        <span className="section-label">Total acumulado</span>
        <strong>{resumo.total ? brl(resumo.total) : "R$ 0,00"}</strong>
        <p>
          {viagem.modoOrcamento === "fixo"
            ? "Comparado ao limite definido"
            : "O orçamento será construído conforme suas escolhas"}
        </p>
      </div>
      <div className="budget-categories">
        {resumo.categorias.map((item) => (
          <div className="budget-category surface-panel" key={item.categoria}>
            <div>
              <span className="budget-dot" />
              <strong>{rotuloCategoria(item.categoria)}</strong>
            </div>
            <b>{brl(item.subtotal)}</b>
            <small>{item.limite ? `Limite ${brl(item.limite)}` : "Sem limite definido"}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
function FinalSummary({
  viagem,
  resumo,
  onConfirmar,
  carregando,
}: {
  viagem: Viagem;
  resumo: ReturnType<typeof resumirOrcamento>;
  onConfirmar: () => void;
  carregando: boolean;
}) {
  return (
    <div className="final-summary surface-panel">
      <div className="final-summary-top">
        <div>
          <span className="section-label">Quase lá</span>
          <h2>Revise antes de confirmar</h2>
          <p>
            Esta etapa cria uma reserva acadêmica simulada, gera um protocolo e monta o relatório
            PDF.
          </p>
        </div>
        <CheckCircle2 size={40} />
      </div>
      <div className="review-grid">
        <Review label="Destino" value={viagem.destino} />
        <Review
          label="Período"
          value={`${dataBr(viagem.dataInicio)} — ${dataBr(viagem.dataFim)}`}
        />
        <Review label="Transporte" value={formatarTransporte(transporteViagem(viagem))} />
        <Review label="Total estimado" value={resumo.total ? brl(resumo.total) : "A definir"} />
      </div>
      <div className="simulation-note">
        <Sparkles size={18} />
        <span>
          Nenhuma compra real é realizada. O Locus apenas registra a simulação e guarda o PDF no seu
          perfil.
        </span>
      </div>
      <button className="primary-button" onClick={onConfirmar} disabled={carregando}>
        {carregando ? "Gerando entrega..." : "Confirmar e gerar meu PDF"} <ArrowRight size={17} />
      </button>
    </div>
  );
}
function Review({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <small>{label}</small>
      <strong>{value || "—"}</strong>
    </div>
  );
}
function ItineraryItem({ item }: { item: ItemRoteiro }) {
  return (
    <div className="itinerary-item">
      <div className="item-time">{item.inicio}</div>
      <div className="item-connector">
        <span />
      </div>
      <div className="item-content">
        <div>
          <strong>{item.titulo}</strong>
          <p>{item.endereco || "Ponto do roteiro"}</p>
        </div>
        <div className="item-tags">
          <span>{item.duracaoMin} min</span>
          {item.favorito && <Heart size={15} fill="currentColor" />}
        </div>
      </div>
    </div>
  );
}
function EmptyItinerary({ onIA }: { onIA: () => void }) {
  return (
    <div className="empty-state surface-panel">
      <Map size={30} />
      <h3>Seu roteiro ainda está em branco.</h3>
      <p>Converse com a IA para montar uma primeira proposta por dia.</p>
      <button className="primary-button" onClick={onIA}>
        <Sparkles size={17} /> Pedir uma sugestão
      </button>
    </div>
  );
}
function EmptyTrip({ onNova }: { onNova: () => void }) {
  return (
    <div className="empty-state surface-panel">
      <Compass size={30} />
      <h3>Seu espaço começa aqui.</h3>
      <p>Crie uma viagem para organizar destino, roteiro, orçamento e entrega.</p>
      <button className="primary-button" onClick={onNova}>
        <Plus size={17} /> Criar uma viagem
      </button>
    </div>
  );
}
function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className={`metric-card ${tone}`}>
      <span className="metric-icon">{icon}</span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
function ActionCard({
  icon,
  title,
  text,
  tone,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button className={`action-card ${tone}`} onClick={onClick}>
      <span className="action-icon">{icon}</span>
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <ArrowRight size={17} />
    </button>
  );
}
function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      {label}
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={label !== "Limite total (opcional)"}
      />
    </label>
  );
}

function LocationField({
  label,
  value,
  onChange,
  placeholder,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<{ id: string; texto: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void autocomplete(query)
        .then((items) => {
          setSuggestions(items);
          setOpen(items.length > 0);
        })
        .catch(() => {
          setSuggestions([]);
          setOpen(false);
        });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      {label}
      <div className="autocomplete-wrap">
        <input
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(suggestions.length > 0)}
          onBlur={() => window.setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          autoComplete="off"
          required
        />
        {open && suggestions.length > 0 ? (
          <div className="autocomplete-list" role="listbox">
            {suggestions.map((item) => (
              <button
                key={item.id || item.texto}
                type="button"
                className="autocomplete-option"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(item.texto);
                  setSuggestions([]);
                  setOpen(false);
                }}
              >
                <MapPin size={14} />
                <span>{item.texto}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="field">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([id, text]) => (
          <option key={id} value={id}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
function Avatar({ nome, large = false }: { nome: string; large?: boolean }) {
  return (
    <span className={`avatar ${large ? "large" : ""}`}>
      {nome
        .split(" ")
        .map((item) => item[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()}
    </span>
  );
}
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="google-mark">
      <path
        fill="#4285F4"
        d="M21.35 12.27c0-.68-.06-1.34-.18-1.97H12v3.73h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.15Z"
      />
      <path
        fill="#34A853"
        d="M12 21.8c2.63 0 4.84-.87 6.45-2.38l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.8Z"
      />
      <path
        fill="#FBBC05"
        d="M6.54 13.86A5.85 5.85 0 0 1 6.23 12c0-.65.11-1.28.31-1.86V7.61H3.3A9.75 9.75 0 0 0 2.27 12c0 1.57.38 3.05 1.03 4.39l3.24-2.53Z"
      />
      <path
        fill="#EA4335"
        d="M12 6.11c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.16 14.63 2.2 12 2.2a9.74 9.74 0 0 0-8.7 5.41l3.24 2.53c.77-2.31 2.92-4.03 5.46-4.03Z"
      />
    </svg>
  );
}
function addDays(date: string, days: number): string {
  if (!date) return "";
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

export default App;
