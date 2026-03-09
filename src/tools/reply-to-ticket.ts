import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerReplyToTicket(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "reply_to_ticket",
    "Send an email reply to a customer on a Gorgias ticket. Fetches the ticket first to resolve the customer's email address.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      body: z.string().describe("Reply message body (plain text)"),
    },
    async ({ ticket, body }) => {
      const ticketId = parseTicketId(ticket);

      const t = await client.getTicket(ticketId);
      const customerEmail = t.customer.email;
      const agentEmail = client.email;

      const msg = await client.createTicketMessage(ticketId, {
        channel: "email",
        via: "helpdesk",
        from_agent: true,
        sender: { email: agentEmail },
        source: {
          type: "email",
          from: { address: agentEmail },
          to: [{ address: customerEmail }],
        },
        body_text: body,
        body_html: `<div>${body}</div>`,
      });

      const preview =
        body.length > 200 ? body.slice(0, 200) + "…" : body;

      const summary = [
        `Reply sent on ticket #${ticketId}`,
        `Message ID: ${msg.id}`,
        `To: ${customerEmail}`,
        `From: ${agentEmail}`,
        `Created: ${msg.created_datetime}`,
        `Preview: ${preview}`,
      ].join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
