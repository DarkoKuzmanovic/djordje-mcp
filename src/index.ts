import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";

import { GorgiasClient } from "./gorgias-client.js";
import { registerGetTicket } from "./tools/get-ticket.js";
import { registerListMessages } from "./tools/list-messages.js";
import { registerGetCustomer } from "./tools/get-customer.js";
import { registerSearchTickets } from "./tools/search-tickets.js";
import { registerCreateTicketMessage } from "./tools/create-ticket-message.js";
import { registerCreateTicket } from "./tools/create-ticket.js";
import { registerUpdateTicket } from "./tools/update-ticket.js";
import { registerAssignTicket } from "./tools/assign-ticket.js";
import { registerCloseTicket } from "./tools/close-ticket.js";
import { registerReplyToTicket } from "./tools/reply-to-ticket.js";
import { registerFindSimilarTickets } from "./tools/find-similar-tickets.js";
import { validateKey, listKeys, createKey, revokeKey } from "./key-store.js";

dotenv.config();

const { GORGIAS_DOMAIN, GORGIAS_EMAIL, GORGIAS_API_KEY, MCP_MASTER_KEY, PORT } =
  process.env;

if (!GORGIAS_DOMAIN || !GORGIAS_EMAIL || !GORGIAS_API_KEY) {
  console.error(
    "Missing required env vars: GORGIAS_DOMAIN, GORGIAS_EMAIL, GORGIAS_API_KEY",
  );
  process.exit(1);
}

if (!MCP_MASTER_KEY) {
  console.error("Missing required env var: MCP_MASTER_KEY");
  process.exit(1);
}

const gorgiasClient = new GorgiasClient({
  domain: GORGIAS_DOMAIN,
  email: GORGIAS_EMAIL,
  apiKey: GORGIAS_API_KEY,
});

// Map of session ID → transport for stateful session management
const transports = new Map<string, StreamableHTTPServerTransport>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "djordje",
    version: "1.0.0",
  });

  registerGetTicket(server, gorgiasClient);
  registerListMessages(server, gorgiasClient);
  registerGetCustomer(server, gorgiasClient);
  registerSearchTickets(server, gorgiasClient);
  registerCreateTicketMessage(server, gorgiasClient);
  registerCreateTicket(server, gorgiasClient);
  registerUpdateTicket(server, gorgiasClient);
  registerAssignTicket(server, gorgiasClient);
  registerCloseTicket(server, gorgiasClient);
  registerReplyToTicket(server, gorgiasClient);
  registerFindSimilarTickets(server, gorgiasClient);

  return server;
}

// --- Auth helpers ---

function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

function getQueryKey(req: IncomingMessage): string | null {
  const url = new URL(req.url ?? "/", "http://localhost");
  return url.searchParams.get("key");
}

function isMcpAuthorized(req: IncomingMessage): boolean {
  const token = getBearerToken(req) ?? getQueryKey(req);
  if (!token) return false;
  return validateKey(token);
}

function isMasterAuthorized(req: IncomingMessage): boolean {
  return getBearerToken(req) === MCP_MASTER_KEY;
}

// --- Admin helpers ---

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => resolve(data));
  });
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleAdmin(req: IncomingMessage, res: ServerResponse) {
  const url = req.url ?? "";

  // Serve the admin HTML without auth — it's just a static shell.
  // All sensitive operations go through /admin/keys which requires the master key.
  if (req.method === "GET" && (url === "/admin" || url.startsWith("/admin?"))) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(ADMIN_HTML);
    return;
  }

  if (!isMasterAuthorized(req)) {
    json(res, 401, { error: "Unauthorized — master key required" });
    return;
  }

  // GET /admin/keys — list keys
  if (req.method === "GET" && url === "/admin/keys") {
    json(res, 200, { keys: listKeys() });
    return;
  }

  // POST /admin/keys — create key
  if (req.method === "POST" && url === "/admin/keys") {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      json(res, 400, { error: "Invalid JSON" });
      return;
    }
    const label = body.label;
    if (!label || typeof label !== "string") {
      json(res, 400, { error: "label is required" });
      return;
    }
    const key = createKey(label);
    json(res, 201, key);
    return;
  }

  // DELETE /admin/keys/:id — revoke key
  const deleteMatch = url.match(/^\/admin\/keys\/([a-f0-9]+)$/);
  if (req.method === "DELETE" && deleteMatch) {
    const revoked = revokeKey(deleteMatch[1]);
    if (!revoked) {
      json(res, 404, { error: "Key not found" });
      return;
    }
    json(res, 200, { ok: true });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
}

// --- HTTP server ---

const port = parseInt(PORT ?? "3000", 10);

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? "/";

  // Admin routes
  if (url.startsWith("/admin")) {
    await handleAdmin(req, res);
    return;
  }

  // MCP routes — root path only
  if (url !== "/" && !url.startsWith("/?")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
    return;
  }

  // Auth check for all MCP requests
  if (!isMcpAuthorized(req)) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Unauthorized — Bearer token required");
    return;
  }

  if (req.method === "POST") {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId) {
      // New session — create transport and server
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createMcpServer();
      try {
        await server.connect(transport);
      } catch (err) {
        await transport.close();
        throw err;
      }

      transport.onclose = () => {
        if (transport.sessionId) {
          transports.delete(transport.sessionId);
        }
      };
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Session not found");
      return;
    }

    await transport.handleRequest(req, res);

    // Store after handleRequest — session ID is assigned during initialize
    if (transport.sessionId && !transports.has(transport.sessionId)) {
      transports.set(transport.sessionId, transport);
    }
  } else if (req.method === "GET") {
    // SSE stream for server-initiated messages
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing or invalid session ID");
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  } else if (req.method === "DELETE") {
    // Session teardown
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.close();
      transports.delete(sessionId);
    }
    res.writeHead(200);
    res.end();
  } else if (req.method === "HEAD") {
    // Protocol version discovery
    res.writeHead(200, {
      "MCP-Protocol-Version": "2025-06-18",
    });
    res.end();
  } else {
    res.writeHead(405, { Allow: "GET, POST, DELETE, HEAD" });
    res.end("Method Not Allowed");
  }
});

httpServer.listen(port, () => {
  console.log(`Djordje MCP server listening on port ${port}`);
});

// --- Admin HTML ---

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Djordje — API Keys</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         max-width: 640px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; margin-bottom: 24px; }
  .form { display: flex; gap: 8px; margin-bottom: 24px; }
  .form input { flex: 1; padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 14px; }
  .form button, .revoke { padding: 8px 16px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
  .form button { background: #1a1a1a; color: #fff; }
  .form button:hover { background: #333; }
  .revoke { background: #fee; color: #c00; }
  .revoke:hover { background: #fcc; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #eee; font-size: 14px; }
  th { color: #666; font-weight: 500; }
  .key-cell { font-family: monospace; font-size: 13px; }
  .created-key { background: #f0fdf4; border: 1px solid #86efac; border-radius: 6px;
                  padding: 12px; margin-bottom: 24px; word-break: break-all; font-family: monospace; font-size: 13px; }
  .created-key strong { display: block; margin-bottom: 4px; font-family: sans-serif; color: #166534; }
  .empty { color: #999; padding: 24px 0; text-align: center; }
</style>
</head>
<body>
<h1>Djordje &mdash; API Keys</h1>

<div class="form">
  <input id="label" placeholder="Key label (e.g. user name)" />
  <button onclick="create()">Create key</button>
</div>

<div id="created"></div>
<div id="keys"></div>

<script>
const KEY = localStorage.getItem("master_key") || prompt("Master key:");
if (KEY) localStorage.setItem("master_key", KEY);
const headers = { "Authorization": "Bearer " + KEY, "Content-Type": "application/json" };

async function load() {
  const res = await fetch("/admin/keys", { headers });
  if (!res.ok) { document.getElementById("keys").innerHTML = '<p class="empty">Unauthorized</p>'; return; }
  const { keys } = await res.json();
  if (!keys.length) { document.getElementById("keys").innerHTML = '<p class="empty">No API keys yet</p>'; return; }
  document.getElementById("keys").innerHTML = '<table>' +
    '<tr><th>Label</th><th>Key</th><th>Created</th><th></th></tr>' +
    keys.map(function(k) { return '<tr>' +
      '<td>' + k.label + '</td>' +
      '<td class="key-cell">' + k.key_prefix + '</td>' +
      '<td>' + new Date(k.created).toLocaleDateString() + '</td>' +
      '<td><button class="revoke" onclick="revoke(\\'' + k.id + '\\')">Revoke</button></td>' +
    '</tr>'; }).join("") +
  '</table>';
}

async function create() {
  var label = document.getElementById("label").value.trim();
  if (!label) return;
  var res = await fetch("/admin/keys", { method: "POST", headers: headers, body: JSON.stringify({ label: label }) });
  var key = await res.json();
  document.getElementById("created").innerHTML =
    '<div class="created-key"><strong>Save this key — it won\\'t be shown again:</strong>' + key.key + '</div>';
  document.getElementById("label").value = "";
  load();
}

async function revoke(id) {
  if (!confirm("Revoke this key?")) return;
  await fetch("/admin/keys/" + id, { method: "DELETE", headers: headers });
  load();
}

load();
</script>
</body>
</html>`;
