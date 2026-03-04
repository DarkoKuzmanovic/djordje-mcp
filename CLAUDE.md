# Djordje — Gorgias MCP Server

Internal MCP server connecting Gorgias helpdesk to Claude.ai .

## Architecture

- **Runtime**: Node.js 22+ (TypeScript, ESM)
- **Protocol**: MCP Spec 2025-06-18 (Streamable HTTP)
- **Transport**: Served on root `/` — POST for JSON-RPC, GET for SSE, DELETE for session teardown
- **Auth**: Gorgias API via HTTP Basic (email:api_key)
- **Deployment**: Docker on TransIP VPS behind Traefik at `mcp.example.com`

## Commands

```bash
npm run dev      # Start dev server with tsx
npm run build    # Compile TypeScript to dist/
npm start        # Run compiled server
bash sync.sh     # Deploy to VPS (rsync + docker compose)
```

## Project Structure

```
src/
├── index.ts              # HTTP server + MCP Streamable HTTP transport
├── gorgias-client.ts     # Gorgias API wrapper (native fetch)
├── tools/                # MCP tool handlers (one file per tool)
│   ├── get-ticket.ts
│   ├── list-messages.ts
│   ├── get-customer.ts
│   └── search-tickets.ts
└── utils/
    └── parse-ticket-url.ts
```

## Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Zod schemas for all MCP tool input validation
- Native `fetch` for HTTP calls (no axios)
- Tool files export a registration function that takes the MCP server instance
- Keep tools focused — one file per MCP tool

## Environment Variables

```
PORT=3000
GORGIAS_DOMAIN=your-domain         # → your-domain.gorgias.com
GORGIAS_EMAIL=darko@...
GORGIAS_API_KEY=...
```

## Deployment

- Traefik handles HTTPS/TLS on the VPS
- `docker-compose.yml` uses Traefik labels (no port mapping)
- Deploy via `sync.sh` (rsync to VPS, rebuild container)

## Gorgias API

- Base URL: `https://{GORGIAS_DOMAIN}.gorgias.com/api/`
- Auth: HTTP Basic with `{email}:{api_key}`
- Docs: https://developers.gorgias.com/reference/introduction
