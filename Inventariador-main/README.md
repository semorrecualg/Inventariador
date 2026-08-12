<div align="center">
<img width="1200" height="300" alt="GBR Banner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# GBR KARDEK — Inventariador

PWA mobile-first para **auditoria física de ativos imobilizados em campo** (GBR Auditoria):
conferência patrimonial com leitura de código de barras/QR, etiquetagem, assinatura
eletrônica, georreferenciamento e relatórios — **offline-first** (Dexie/IndexedDB) com
**sincronização multi-tenant no Supabase** (login por contrato: cada usuário amarrado a
um `tenantid`).

## Stack

React 18 · TypeScript · Vite 5 · Tailwind CSS v4 · Dexie.js · Supabase · Capacitor 6
(Android) · Vitest · Playwright

## Rodar localmente

**Pré-requisitos:** Node.js

```bash
npm install --legacy-peer-deps   # flag obrigatória neste projeto
npm run dev                      # dev server Vite (porta 3000)
```

O modo de banco é definido pelas credenciais de ambiente:

| Variável | Efeito |
|---|---|
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Ativa o modo **SUPABASE** (nuvem multi-tenant) |
| (ausentes) | Modo **INTERNAL** — 100% offline, sem chamadas de rede |
| `VITE_ADMIN_EMAIL` | E-mail admin (default `semorr@gmail.com`) |
| `GEMINI_API_KEY` | Insights de IA (`geminiService`) — opcional |

## Comandos

| Comando | Ação |
|---|---|
| `npm run dev` | Dev server (porta 3000) |
| `npm run build` | Build de produção (`dist/`) |
| `npm test` | Vitest — 295 testes / 30 arquivos |
| `npx tsc -b --noEmit` | Typecheck (deve estar zerado) |
| `npm run lint` | ESLint |

## Documentação

| Documento | Conteúdo |
|---|---|
| `docs/SPEC.md` | Especificação canônica do projeto |
| `docs/ARCHITECTURE.md` | Arquitetura interna, fluxos, checklist SRE |
| `docs/RBAC_GOVERNANCA.md` | Matriz de papéis e rotinas RBAC |
| `docs/SCHEMA_BASELINE.md` | Snapshot congelado do schema local (v7 — chave composta `[tenantid+primarykey]`) |
| `docs/MIGRACAO_HIBRIDA.md` | Plano de dados (fases 0–5) |
| `SYSTEM_INSTRUCTIONS.md` | Governança SRE do repositório |
| `SKILL.md` | Skill de release (changelog/versão/GitHub release) |
| `CHANGELOG.md` | Histórico de versões |
| `TROUBLESHOOTING.md` | Problemas conhecidos e instalação |

Repositório: [semorrecualg/Inventariador](https://github.com/semorrecualg/Inventariador)
