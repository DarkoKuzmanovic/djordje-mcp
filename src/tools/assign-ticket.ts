import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerAssignTicket(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "assign_ticket",
    "Assign or reassign a Gorgias ticket to a specific agent or team. Pass null IDs to unassign.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      assignee_user_id: z
        .number()
        .nullable()
        .optional()
        .describe("Gorgias user ID to assign to (null to unassign)"),
      assignee_team_id: z
        .number()
        .nullable()
        .optional()
        .describe("Gorgias team ID to assign to (null to unassign)"),
    },
    async ({ ticket, assignee_user_id, assignee_team_id }) => {
      const ticketId = parseTicketId(ticket);

      const payload: Record<string, unknown> = {};
      if (assignee_user_id !== undefined)
        payload.assignee_user = assignee_user_id
          ? { id: assignee_user_id }
          : null;
      if (assignee_team_id !== undefined)
        payload.assignee_team = assignee_team_id
          ? { id: assignee_team_id }
          : null;

      const updated = await client.updateTicket(ticketId, payload);

      const summary = [
        `Ticket #${updated.id} assignment updated`,
        updated.assignee_user
          ? `Assignee: ${updated.assignee_user.name} <${updated.assignee_user.email}>`
          : "Assignee: Unassigned",
        updated.assignee_team
          ? `Team: ${updated.assignee_team.name}`
          : null,
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
