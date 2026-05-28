# lia-pwa

PWA mobile/offline-first para operadores, entregadores, pedidos, checkpoints, anexos e sync.

## URL pública alvo

https://pwa.aneety.com/

## Arquitetura alvo

- Cloudflare Pages Free para assets estáticos gerados por Vite em `dist`.
- Supabase Auth para login.
- API Cloudflare Workers + Hono via `VITE_API_URL=https://api.aneety.com`.
- Contratos compartilhados por `lia-core` em <https://core.aneety.com/>.
- Base real Supabase/Postgres; não usar mock como destino final.
- Custo zero: sem Pages Functions pagas, Workers Paid, Containers ou add-ons.

## Fluxo principal

- Login Supabase Auth.
- Criar pedido e operar offline no IndexedDB.
- Sincronizar pedidos, checkpoints, anexos e pagamentos com https://api.aneety.com.
- Persistir dados no Supabase/Postgres real.

## Status

Scaffold React/Vite com baseline shadcn/ui inicial. Fluxos funcionais serão ampliados após estabilização de Auth, API e massa de teste Supabase.

## Deploy Cloudflare Pages Free

```bash
pnpm lint
pnpm test
pnpm build
pnpm deploy:cloudflare
```

Projeto Cloudflare Pages esperado: `lia-pwa`, com deploy do diretório `dist`.

## Design system

- React + Vite + TypeScript + Tailwind + shadcn/ui.
- `components.json` versionado no repo.
- Componentes copiados para `src/components/ui` via `pnpm dlx shadcn@latest add`.
- Aliases `@/*`, `@/components`, `@/components/ui`, `@/lib` configurados para o app.
