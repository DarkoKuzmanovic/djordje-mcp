import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerListMessages(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "list_ticket_messages",
    "Get the full conversation thread for a Gorgias ticket.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      limit: z
        .number()
        .optional()
        .default(30)
        .describe("Max messages to return (default 30)"),
    },
    async ({ ticket, limit }) => {
      const id = parseTicketId(ticket);
      const result = await client.listTicketMessages(id, limit);

      const messages = result.data.map((msg) => {
        const from = msg.from_agent ? `[Agent] ${msg.sender.name}` : `[Customer] ${msg.sender.name}`;
        const date = msg.created_datetime;
        const body = msg.stripped_text || msg.body_text || "(no text content)";
        const attachments =
          msg.attachments.length > 0
            ? `\nAttachments: ${msg.attachments.map((a) => a.name).join(", ")}`
            : "";

        return `--- ${from} (${date}) ---\n${body}${attachments}`;
      });

      const text =
        messages.length > 0
          ? `Ticket #${id} — ${messages.length} message(s):\n\n${messages.join("\n\n")}`
          : `Ticket #${id} has no messages.`;

      return { content: [{ type: "text", text }] };
    },
  );
}
