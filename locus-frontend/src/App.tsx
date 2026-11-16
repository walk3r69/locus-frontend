import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Compass,
  Download,
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
  Sparkles,
  WalletCards,
  X,
} from "lucide-react";

import { api, normalizarErro } from "@/services/api";
import { entrar, entrarComGoogle, sair, usuarioAtual } from "@/services/auth";
import {
  buscaTextual,
  perguntarGemini,
  streetViewMetadata,
  type StreetViewMeta,
} from "@/services/integracoes";
import { confirmarRoteiro } from "@/services/reservas";
import { baixarRelatorio, listarRelatorios } from "@/services/relatorios";
import { criarRoteiroInicial } from "@/services/roteiros";
import { sincronizarUsuario } from "@/services/usuarioBackend";
import { criarViagem, listarViagens, obterViagem } from "@/services/viagens";
import { MapPreview } from "@/components/MapPreview";
import { brl, CATEGORIAS, resumirOrcamento } from "@/features/budget/logic";
import type {
  CategoriaOrcamento,
  ItemRoteiro,
  Lugar,
  MensagemAssistente,
  ModoOrcamento,
  Relatorio,
  Transporte,
  Usuario,
  Viagem,
} from "@/types";

type View = "inicio" | "viagem" | "nova" | "ia" | "perfil";
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
  return (viagem.orcamento ?? []).reduce((total, item) => total + Number(item.valor || 0), 0);
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
  const [backend, setBackend] = useState<"verificando" | "online" | "indisponivel">("verificando");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    void usuarioAtual().then(setUsuario);
    void api
      .get("/api/teste")
      .then(() => setBackend("online"))
      .catch(() => setBackend("indisponivel"));
  }, []);
  useEffect(() => {
    if (!usuario) return;
    void (async () => {
      try {
        await sincronizarUsuario(usuario);
      } catch (error) {
        setToast(normalizarErro(error).message);
      }
      try {
        const lista = await listarViagens();
        setViagens(lista);
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
  function navegar(proxima: View) {
    setView(proxima);
    setMobileMenu(false);
  }

  if (!usuario)
    return (
      <LoginPage
        backend={backend}
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
        <div className="sidebar-context">
          <span className="status-dot" />
          <span>{backend === "online" ? "Backend conectado" : "Backend indisponível"}</span>
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
            onClick={() => setToast("As preferências ficam vinculadas ao seu perfil do viajante.")}
          >
            <Settings2 size={18} />
            <span>Preferências</span>
          </button>
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
            <button
              className="icon-button"
              aria-label="Notificações"
              onClick={() => setToast("Você está em dia com as novidades do Locus.")}
            >
              <Bell size={19} />
              <span className="notification-dot" />
            </button>
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
              backend={backend}
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
            />
          )}
          {view === "perfil" && (
            <ProfileView
              usuario={usuario}
              viagens={viagens}
              relatorios={relatorios}
              onAbrir={abrirViagem}
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
  backend,
  carregando,
  mensagem,
  onGoogle,
}: {
  backend: string;
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
          <p className="connection-note">
            <span className={`status-dot ${backend === "online" ? "online" : ""}`} />{" "}
            {backend === "online" ? "Backend conectado" : "Verificando conexão com o backend"}
          </p>
        </div>
      </section>
    </main>
  );
}

function HomeView({
  viagens,
  selecionada,
  usuario,
  backend,
  onNova,
  onIA,
  onAbrir,
  onPerfil,
}: {
  viagens: Viagem[];
  selecionada: Viagem | null;
  usuario: Usuario;
  backend: string;
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
            Terça-feira, {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })}
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
        <Metric icon={<Sparkles size={19} />} label="Ideias com a IA" value="12" tone="purple" />
        <Metric icon={<FileText size={19} />} label="Relatórios salvos" value="04" tone="green" />
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
                <strong>Backend {backend === "online" ? "conectado" : "em modo local"}</strong>
                <p>Suas decisões ficam organizadas em um só lugar.</p>
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
      limites: { ...LIMITES, passagem: Number(form.limiteTotal) || 0 },
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
            <Field
              label="De onde você sai?"
              value={form.origem}
              onChange={(value) => update("origem", value)}
              placeholder="Cidade ou aeroporto"
            />
            <Field
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
        </div>
        <div className="form-actions">
          <button type="button" className="secondary-button" onClick={onCancelar}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={carregando || !form.destino || !form.dataInicio || !form.dataFim}
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
    viagem.orcamento ?? [],
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
}: {
  viagem: Viagem | null;
  onVoltar: () => void;
  onToast: (value: string) => void;
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
  const [enviando, setEnviando] = useState(false);
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
      const resposta = await perguntarGemini([...mensagens, user], pergunta);
      setMensagens((atuais) => [...atuais, resposta]);
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
      const resultado = await buscaTextual(busca);
      setLugares(resultado.lugares);
      setStreetViews({});
    } catch (error) {
      onToast(normalizarErro(error).message);
    }
  }
  async function revisarLugar(lugar: Lugar) {
    onToast(`Consultando o Street View de ${lugar.nome}...`);
    try {
      const resultado = await streetViewMetadata(lugar.lat, lugar.lng);
      setStreetViews((atual) => ({ ...atual, [lugar.placeId]: resultado }));
      onToast(
        resultado.status === "OK"
          ? `${lugar.nome} está pronto para você conferir no mapa e no Street View.`
          : `O Street View não encontrou uma imagem disponível para ${lugar.nome}.`,
      );
    } catch (error) {
      onToast(normalizarErro(error).message);
    }
  }
  return (
    <section className="view-stack">
      <div className="back-row">
        <button className="back-button" onClick={onVoltar}>
          <ArrowRight className="rotate-180" size={16} /> Voltar
        </button>
        <span className="ai-live">
          <span className="pulse-dot" /> Gemini com fallback Groq + Google Places
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
                        <small>{recomendacao.justificativa}</small>
                      </div>
                      <button
                        onClick={() =>
                          onToast(
                            `${recomendacao.titulo} foi separado para você revisar no roteiro.`,
                          )
                        }
                      >
                        <Plus size={15} />
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
                    <button
                      key={lugar.placeId}
                      className="place-result"
                      type="button"
                      onClick={() => void revisarLugar(lugar)}
                    >
                      <span className="place-icon">
                        <MapPin size={15} />
                      </span>
                      <span>
                        <strong>{lugar.nome}</strong>
                        <small>
                          {lugar.categoria} · {lugar.endereco}
                        </small>
                      </span>
                      <ChevronRight size={15} />
                    </button>
                  ))}
                </div>
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
    </section>
  );
}

function ProfileView({
  usuario,
  viagens,
  relatorios,
  onAbrir,
  onBaixar,
}: {
  usuario: Usuario;
  viagens: Viagem[];
  relatorios: Relatorio[];
  onAbrir: (viagem: Viagem) => void;
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
        <button className="secondary-button profile-edit">
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
