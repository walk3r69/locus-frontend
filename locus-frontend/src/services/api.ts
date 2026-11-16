import axios, { AxiosError } from "axios";
import { getIdToken } from "./auth";

/** Single Axios instance for the Spring Boot backend. */
export const API_URL = (
  (import.meta.env["VITE_API_URL"] as string | undefined) || "http://localhost:8080"
).replace(/\/$/, "");

export const api = axios.create({
  baseURL: API_URL ?? "/",
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const token = await getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export type TipoErro =
  "validacao" | "autenticacao" | "provedor" | "timeout" | "quota" | "rede" | "desconhecido";

export class LocusError extends Error {
  constructor(
    public tipo: TipoErro,
    message: string,
    public campos?: Record<string, string>,
  ) {
    super(message);
  }
}

type BackendError = {
  message?: string;
  mensagem?: string;
  campos?: Record<string, string>;
  erros?: Record<string, string>;
};

export function normalizarErro(e: unknown): LocusError {
  if (e instanceof LocusError) return e;
  const err = e as AxiosError<BackendError>;
  if (err?.code === "ECONNABORTED")
    return new LocusError("timeout", "O serviço demorou para responder.");
  const status = err?.response?.status;
  const payload = err?.response?.data;
  const msg = payload?.mensagem ?? payload?.message;
  const campos = payload?.erros ?? payload?.campos;
  if (status === 400 || status === 422)
    return new LocusError("validacao", msg ?? "Alguns dados precisam de ajuste.", campos);
  if (status === 401 || status === 403)
    return new LocusError("autenticacao", "Sua sessão expirou. Entre novamente.");
  if (status === 429)
    return new LocusError("quota", "O limite de consultas foi atingido. Tente mais tarde.");
  if (status === 502 || status === 503)
    return new LocusError("provedor", msg ?? "O provedor externo não respondeu.");
  if (status === 504) return new LocusError("timeout", "O provedor demorou para responder.");
  if (!err?.response) return new LocusError("rede", "Sem conexão com o servidor do Locus.");
  return new LocusError("desconhecido", msg ?? "Algo deu errado.");
}

export async function chamar<T>(fn: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await fn()).data;
  } catch (e) {
    throw normalizarErro(e);
  }
}
