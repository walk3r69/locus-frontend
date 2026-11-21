# Locus — frontend

Frontend do Locus, uma plataforma para planejar viagens, organizar roteiros, acompanhar orçamento e consultar recomendações.

## Stack

- React 19 com TypeScript;
- Vite e Tailwind CSS;
- Axios para chamadas ao backend;
- Firebase Authentication opcional;
- Vitest para testes.

## Como executar

Requisitos: Node.js 20+ e o backend Spring Boot do Locus em execução.

```bash
npm install
npm run dev
```

O frontend abre em `http://localhost:5173`.

Sem `VITE_API_URL`, o frontend entra automaticamente no modo demonstrativo e
permite testar o fluxo inteiro no navegador: login, dashboard, criação de viagem,
conversa com a IA demonstrativa, roteiro, simulação, geração do PDF e download no
perfil. Para o modo integrado, execute o backend em `http://localhost:8080` e
preencha as variáveis abaixo.

Para validar a entrega:

```bash
npm run lint
npm test
npm run build
```

## Variáveis de ambiente

Crie um arquivo `.env.local` na raiz:

```env
VITE_API_URL=http://localhost:8080
VITE_BACKEND_USER_ID=1

# Firebase.
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
```

Com as variáveis do Firebase preenchidas, o botão principal de login usa
`GoogleAuthProvider` e `signInWithPopup`. O domínio usado no navegador precisa
estar autorizado em Firebase Authentication. Depois do login, o frontend cria ou
localiza o usuário no endpoint `/api/usuarios` e guarda o `id` numérico usado nas
rotas do Spring.

O navegador não recebe chaves de Gemini, Google ou Amadeus. Essas integrações são chamadas pelos adaptadores do backend em `/api/integracoes`.

## Integração com o backend

Os serviços em `src/services` usam as rotas do backend separado:

- `api.ts`: cliente Axios, token Firebase e tratamento de erros do Spring;
- `auth.ts`: Firebase Authentication ou sessão demonstrativa local;
- `integracoes.ts`: Gemini, Google Places, Routes, Street View e Amadeus;
- `viagens.ts`: viagens, compartilhamento e notificações;
- `reservas.ts`: reservas simuladas;
- `relatorios.ts`: relatório e download do PDF;
- `roteiros.ts`: criação de dia/item inicial, versões e integração dos itens do roteiro;
- `orcamento.ts`: regras locais e ponto de integração dos itens e limites do backend;
- `usuarioBackend.ts`: vínculo entre o UID do Firebase e o ID numérico do Spring.

Quando `VITE_API_URL` não está preenchida, a aplicação usa dados demonstrativos locais para permitir a navegação sem banco de dados. Quando ela está preenchida, as chamadas são enviadas ao Spring Boot e o token do Firebase é incluído automaticamente quando houver sessão válida.

O fluxo de entrega segue os serviços existentes no backend: criar a reserva
simulada, preparar o pagamento simulado, iniciar e concluir o pagamento simulado,
confirmar a reserva e chamar `/api/relatorios/reserva/{reservaId}`. O PDF é baixado
por `/api/relatorios/{relatorioId}/pdf` e fica listado no perfil. Nenhuma compra real
é feita.

## Identidade visual

A aplicação usa a logo e o ícone oficiais entregues para o projeto:

- `public/assets/locus_logo.svg`;
- `public/assets/locus_icone.svg`.

As cores foram mantidas suaves para evitar excesso de saturação:

- laranja `#E9784B` para ações principais;
- verde `#6FA68A` para estados positivos;
- roxo `#7667A8` para IA e recomendações;
- azul-acinzentado `#27343B` para texto principal.
