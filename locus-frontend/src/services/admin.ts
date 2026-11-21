import { api, chamar } from "./api";
import { backendUserId } from "./usuarioBackend";

export interface AdminEmail {
  email: string;
  contaEncontrada: boolean;
  usuarioId?: number;
  nome?: string;
}

export interface UsuarioAdmin {
  id: number;
  nome: string;
  email: string;
  tipoUsuario: string;
}

export interface DashboardAdmin {
  usuarios: number;
  viagens: number;
  destinosUnicos: number;
  destinos: { destino: string; quantidade: number }[];
}

const params = () => ({ usuarioSolicitanteId: backendUserId() });

export function listarAdministradores(): Promise<AdminEmail[]> {
  return chamar(() => api.get<AdminEmail[]>("/api/admin/administradores", { params: params() }));
}

export function adicionarAdministrador(email: string): Promise<AdminEmail> {
  return chamar(() => api.post<AdminEmail>("/api/admin/administradores", { email }, { params: params() }));
}

export function removerAdministrador(email: string): Promise<void> {
  return chamar(() => api.delete(`/api/admin/administradores/${encodeURIComponent(email)}`, { params: params() }));
}

export function listarUsuariosAdmin(): Promise<UsuarioAdmin[]> {
  return chamar(() => api.get<UsuarioAdmin[]>("/api/admin/usuarios", { params: params() }));
}

export function listarDashboardAdmin(): Promise<DashboardAdmin> {
  return chamar(() => api.get<DashboardAdmin>("/api/admin/dashboard", { params: params() }));
}

export function alterarTipoUsuario(id: number, tipoUsuario: string): Promise<UsuarioAdmin> {
  return chamar(() => api.put<UsuarioAdmin>(`/api/admin/usuarios/${id}/tipo`, undefined, { params: { ...params(), novoTipo: tipoUsuario } }));
}
