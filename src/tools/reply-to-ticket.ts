import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function registerReplyToTicket(
  server: McpServer,
  client: GorgiasClient,
) {
  const rawUserId = process.env.GORGIAS_USER_ID;
  if (!rawUserId || isNaN(parseInt(rawUserId, 10))) {
    throw new Error("Missing or invalid GORGIAS_USER_ID environment variable");
  }
  const userId = parseInt(rawUserId, 10);

  server.tool(
    "reply_to_ticket",
    "Send an email reply to a customer on a Gorgias ticket. Fetches the ticket first to resolve the customer's email and the correct integration.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      body: z.string().describe("Reply message body (plain text)"),
    },
    async ({ ticket, body }) => {
      const ticketId = parseTicketId(ticket);

      // Fetch ticket and its messages to find the inbound integration
      const [t, messages] = await Promise.all([
        client.getTicket(ticketId),
        client.listTicketMessages(ticketId, 10),
      ]);

      const customerEmail = t.customer.email;
      const agentEmail = client.email;

      // Find the integration from the first customer (inbound) message
      const inboundMsg = messages.data?.find((m) => !m.from_agent);
      const integrationId = inboundMsg?.integration_id;

      // Derive the "from" address from the inbound message's "to" field
      const inboundTo = inboundMsg?.source?.to?.[0]?.address;
      const fromAddress = inboundTo ?? agentEmail;

      // Resolve customer ID for the receiver field
      const customerId = t.customer.id;

      // Elicit user confirmation before sending email to customer
      const preview = body.length > 200 ? body.slice(0, 200) + "…" : body;
      const confirmation = await server.server.elicitInput({
        mode: "form",
        message: `Send email reply on ticket #${ticketId}?\n\nTo: ${customerEmail}\nFrom: ${fromAddress}\n\n${preview}`,
        requestedSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              title: "Send this reply?",
              default: false,
            },
          },
          required: ["confirm"],
        },
      });

      if (confirmation.action !== "accept" || !confirmation.content?.confirm) {
        return {
          content: [
            { type: "text", text: "Reply cancelled — message was NOT sent." },
          ],
        };
      }

      const msg = await client.createTicketMessage(ticketId, {
        channel: "email",
        via: "helpdesk",
        from_agent: true,
        sender: { id: userId },
        receiver: { id: customerId, email: customerEmail },
        source: {
          type: "email",
          from: { address: fromAddress },
          to: [{ address: customerEmail }],
        },
        body_text: body,
        body_html: `<div>${escapeHtml(body)}</div>`,
      });

      const summary = [
        `Reply sent on ticket #${ticketId}`,
        `Message ID: ${msg.id}`,
        `To: ${customerEmail}`,
        `From: ${fromAddress}`,
        `Integration: ${integrationId ?? "none"}`,
        `Created: ${msg.created_datetime}`,
        `Preview: ${preview}`,
      ].join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
