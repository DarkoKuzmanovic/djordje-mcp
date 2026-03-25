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
  const rawUserId = process.env.GORGIAS_USER_ID;
  if (!rawUserId || isNaN(parseInt(rawUserId, 10))) {
    throw new Error("Missing or invalid GORGIAS_USER_ID environment variable");
  }
  const userId = parseInt(rawUserId, 10);

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

      // Elicit user confirmation for customer-facing channels
      if (channel !== "internal-note") {
        const preview =
          body_text.length > 200 ? body_text.slice(0, 200) + "…" : body_text;
        const confirmation = await server.server.elicitInput({
          mode: "form",
          message: `Send ${channel} message on ticket #${ticketId}?\n\n${preview}`,
          requestedSchema: {
            type: "object",
            properties: {
              confirm: {
                type: "boolean",
                title: `Send this ${channel} message to the customer?`,
                default: false,
              },
            },
            required: ["confirm"],
          },
        });

        if (
          confirmation.action !== "accept" ||
          !confirmation.content?.confirm
        ) {
          return {
            content: [
              {
                type: "text",
                text: `Message cancelled — ${channel} message was NOT sent.`,
              },
            ],
          };
        }
      }

      const msg = await client.createTicketMessage(ticketId, {
        channel,
        from_agent: true,
        via: "api",
        sender: { id: userId },
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
