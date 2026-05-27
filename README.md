# lia-pwa

PWA mobile/offline-first para operadores, entregadores, pedidos, checkpoints, anexos e sync.

## URL pública alvo

https://pwa.aneety.com/

## Arquitetura alvo

- Cloudflare Pages Free para assets estáticos.
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

Scaffold inicial separado. Implementação funcional virá após estabilização do `REQ.md`, `lia-core` e `lia-backend` em Cloudflare Workers/Supabase.

## Deploy Cloudflare Pages Free

```bash
pnpm lint
pnpm test
pnpm build
pnpm deploy:cloudflare
```

Projeto Cloudflare Pages esperado: `lia-pwa`.
