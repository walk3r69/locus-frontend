import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";

vi.mock("@/services/auth", () => ({
  usuarioAtual: vi.fn().mockResolvedValue(null),
  entrar: vi.fn(),
  entrarComGoogle: vi.fn(),
  firebaseAtivo: false,
  sair: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  api: { get: vi.fn().mockRejectedValue(new Error("backend ausente no teste")) },
  isDemoMode: true,
  normalizarErro: vi.fn((error: unknown) => error),
}));

describe("Aplicação Locus", () => {
  it("renderiza a tela de entrada com a identidade Locus", async () => {
    render(<App />);

    expect(await screen.findByText("Planeje com intenção.")).toBeInTheDocument();
    expect(screen.getAllByAltText("Locus").length).toBeGreaterThan(0);
  });
});
