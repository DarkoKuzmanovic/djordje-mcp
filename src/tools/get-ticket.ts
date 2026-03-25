import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerGetTicket(server: McpServer, client: GorgiasClient) {
  server.tool(
    "get_ticket",
    "Fetch a Gorgias ticket by ID or URL. Returns subject, status, channel, tags, assignee, customer, and message count.",
    { ticket: z.string().describe("Ticket ID or Gorgias ticket URL") },
    async ({ ticket }) => {
      const id = parseTicketId(ticket);
      const t = await client.getTicket(id);

      const summary = [
        `Ticket #${t.id}: ${t.subject}`,
        `Status: ${t.status} | Priority: ${t.priority} | Channel: ${t.channel}`,
        `Customer: ${t.customer.name} <${t.customer.email}> (ID: ${t.customer.id})`,
        t.assignee_user
          ? `Assignee: ${t.assignee_user.name} <${t.assignee_user.email}>`
          : "Assignee: Unassigned",
        t.assignee_team ? `Team: ${t.assignee_team.name}` : null,
        t.tags.length > 0
          ? `Tags: ${t.tags.map((tag) => tag.name).join(", ")}`
          : null,
        `Messages: ${t.messages_count}`,
        `Created: ${t.created_datetime}`,
        t.closed_datetime ? `Closed: ${t.closed_datetime}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
