import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

const CHANNELS = [
  "email",
  "chat",
  "internal-note",
  "facebook-messenger",
  "instagram-direct-message",
  "sms",
  "whatsapp",
  "phone",
] as const;

export function registerCreateTicketMessage(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "create_ticket_message",
    "Post a reply or internal note on a Gorgias ticket. Defaults to internal-note (safe). Set channel to 'email' to send to the customer.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      body_text: z.string().describe("Plain-text message body"),
      body_html: z
        .string()
        .optional()
        .describe("Optional HTML message body"),
      channel: z
        .enum(CHANNELS)
        .optional()
        .default("internal-note")
        .describe(
          "Message channel (default: internal-note). Use 'email' to send to customer.",
        ),
    },
    async ({ ticket, body_text, body_html, channel }) => {
      const ticketId = parseTicketId(ticket);

      const msg = await client.createTicketMessage(ticketId, {
        channel,
        from_agent: true,
        via: "api",
        body_text,
        body_html,
      });

      const preview =
        body_text.length > 200
          ? body_text.slice(0, 200) + "…"
          : body_text;

      const summary = [
        `Message #${msg.id} created on ticket #${ticketId}`,
        `Channel: ${msg.channel}`,
        `Created: ${msg.created_datetime}`,
        `Preview: ${preview}`,
      ].join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
