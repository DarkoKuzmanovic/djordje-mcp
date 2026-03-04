# Djordje

Remote MCP server that connects [Gorgias](https://www.gorgias.com/) helpdesk to [Claude.ai](https://claude.ai) via the [Model Context Protocol](https://modelcontextprotocol.io/).

Paste a Gorgias ticket URL or ID in Claude.ai and discuss it directly.

## Tools

| Tool | Description |
|---|---|
| `get_ticket` | Fetch ticket by ID or Gorgias URL |
| `list_ticket_messages` | Get full conversation thread |
| `get_customer` | Customer details by ID |
| `search_tickets` | Filter tickets by status, customer, assignee |

## Setup

Requires Node.js 22+ and a [Gorgias API key](https://developers.gorgias.com/reference/introduction).

```bash
cp .env.example .env
# Edit .env with your Gorgias credentials
npm install
npm run dev
```

Test locally with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
# Connect using Streamable HTTP → http://localhost:3000/
```

## Deploy

Build and run with Docker:

```bash
docker compose up -d
```

The server expects a reverse proxy (Traefik, Caddy, nginx) for HTTPS termination. Claude.ai requires HTTPS to connect.

Once deployed, add your server URL in Claude.ai: **Settings → Integrations → Add more**.

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Server port (default: 3000) |
| `GORGIAS_DOMAIN` | Your Gorgias subdomain (e.g. `myshop` for myshop.gorgias.com) |
| `GORGIAS_EMAIL` | Gorgias account email |
| `GORGIAS_API_KEY` | Gorgias REST API key |

## License

MIT
