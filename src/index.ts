import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import dotenv from "dotenv";

import { GorgiasClient } from "./gorgias-client.js";
import { registerGetTicket } from "./tools/get-ticket.js";
import { registerListMessages } from "./tools/list-messages.js";
import { registerGetCustomer } from "./tools/get-customer.js";
import { registerSearchTickets } from "./tools/search-tickets.js";

dotenv.config();

const { GORGIAS_DOMAIN, GORGIAS_EMAIL, GORGIAS_API_KEY, PORT } = process.env;

if (!GORGIAS_DOMAIN || !GORGIAS_EMAIL || !GORGIAS_API_KEY) {
  console.error(
    "Missing required env vars: GORGIAS_DOMAIN, GORGIAS_EMAIL, GORGIAS_API_KEY",
  );
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

  return server;
}

const port = parseInt(PORT ?? "3000", 10);

const httpServer = createServer(async (req, res) => {
  const url = req.url ?? "/";

  // Only serve on root path
  if (url !== "/" && !url.startsWith("/?")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
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
      await server.connect(transport);

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
