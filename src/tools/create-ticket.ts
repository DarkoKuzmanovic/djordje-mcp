import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";

export function registerCreateTicket(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "create_ticket",
    "Create a new Gorgias support ticket with an initial message. Requires customer email and message body.",
    {
      customer_email: z
        .string()
        .email()
        .describe("Customer email address"),
      subject: z.string().describe("Ticket subject line"),
      body_text: z.string().describe("Plain-text body of the first message"),
      body_html: z
        .string()
        .optional()
        .describe("Optional HTML body of the first message"),
      channel: z
        .enum(["email", "chat", "internal-note", "phone", "api"])
        .optional()
        .default("email")
        .describe("Ticket channel (default: email)"),
      priority: z
        .enum(["low", "normal", "high", "critical"])
        .optional()
        .default("normal")
        .describe("Ticket priority (default: normal)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional list of tag names"),
      assignee_user_id: z
        .number()
        .optional()
        .describe("Optional Gorgias user ID to assign the ticket to"),
    },
    async ({
      customer_email,
      subject,
      body_text,
      body_html,
      channel,
      priority,
      tags,
      assignee_user_id,
    }) => {
      const ticket = await client.createTicket({
        via: "api",
        channel,
        from_agent: true,
        subject,
        priority,
        customer: { email: customer_email },
        assignee_user: assignee_user_id
          ? { id: assignee_user_id }
          : undefined,
        tags: tags?.map((name) => ({ name })),
        messages: [
          {
            channel,
            from_agent: true,
            via: "api",
            body_text,
            body_html,
          },
        ],
      });

      const summary = [
        `Ticket #${ticket.id} created`,
        `Subject: ${ticket.subject}`,
        `Status: ${ticket.status} | Priority: ${ticket.priority} | Channel: ${ticket.channel}`,
        `Customer: ${ticket.customer?.email ?? customer_email}`,
        ticket.assignee_user
          ? `Assignee: ${ticket.assignee_user.name}`
          : null,
        ticket.tags.length > 0
          ? `Tags: ${ticket.tags.map((t) => t.name).join(", ")}`
          : null,
        `Created: ${ticket.created_datetime}`,
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
