import type { Usuario } from "@/types";
import { api, chamar } from "./api";

const STORAGE_KEY = "locus.backend.user.id";

export function backendUserId(): number {
  const stored = Number(localStorage.getItem(STORAGE_KEY));
  if (Number.isFinite(stored) && stored > 0) return stored;
  return Number(import.meta.env["VITE_BACKEND_USER_ID"] ?? "1");
}

export async function sincronizarUsuario(usuario: Usuario): Promise<number> {
  const body = {
    firebaseUid: usuario.uid,
    nome: usuario.nome,
    email: usuario.email,
    termosAceitos: true,
    tipoUsuario: "VIAJANTE",
  };
  try {
    const criado = await chamar<{ id: number }>(() => api.post("/api/usuarios", body));
    localStorage.setItem(STORAGE_KEY, String(criado.id));
    return criado.id;
  } catch {
    const usuarios = await chamar<Array<{ id: number; email: string; firebaseUid?: string }>>(() =>
      api.get("/api/usuarios"),
    );
    const encontrado = usuarios.find(
      (item) =>
        item.firebaseUid === usuario.uid ||
        item.email.toLowerCase() === usuario.email.toLowerCase(),
    );
    if (!encontrado) throw new Error("Não foi possível vincular seu usuário ao backend.");
    localStorage.setItem(STORAGE_KEY, String(encontrado.id));
    return encontrado.id;
  }
}
