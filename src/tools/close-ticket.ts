import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerCloseTicket(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "close_ticket",
    "Close (or reopen) a Gorgias ticket. Optionally post a closing note.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      status: z
        .enum(["open", "closed"])
        .optional()
        .default("closed")
        .describe("Target status (default: closed)"),
      closing_message: z
        .string()
        .optional()
        .describe(
          "Optional internal note to post before changing status",
        ),
    },
    async ({ ticket, status, closing_message }) => {
      const ticketId = parseTicketId(ticket);

      if (closing_message) {
        await client.createTicketMessage(ticketId, {
          channel: "internal-note",
          from_agent: true,
          via: "api",
          body_text: closing_message,
        });
      }

      const updated = await client.updateTicket(ticketId, { status });

      const summary = [
        `Ticket #${updated.id} ${status === "closed" ? "closed" : "reopened"}`,
        `Subject: ${updated.subject}`,
        closing_message ? `Closing note: ${closing_message}` : null,
        `Updated: ${updated.updated_datetime}`,
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
