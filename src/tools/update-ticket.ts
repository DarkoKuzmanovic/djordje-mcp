import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerUpdateTicket(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "update_ticket",
    "Update a Gorgias ticket's metadata: status, priority, subject, assignee, or tags.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      status: z
        .enum(["open", "closed"])
        .optional()
        .describe("Set ticket status"),
      priority: z
        .enum(["low", "normal", "high", "critical"])
        .optional()
        .describe("Set ticket priority"),
      subject: z.string().optional().describe("Update ticket subject"),
      assignee_user_id: z
        .number()
        .optional()
        .describe("Gorgias user ID to assign the ticket to (null to unassign)"),
      assignee_team_id: z
        .number()
        .optional()
        .describe("Gorgias team ID to assign the ticket to"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Replace ticket tags with this list of tag names"),
    },
    async ({
      ticket,
      status,
      priority,
      subject,
      assignee_user_id,
      assignee_team_id,
      tags,
    }) => {
      const ticketId = parseTicketId(ticket);

      const payload: Record<string, unknown> = {};
      if (status !== undefined) payload.status = status;
      if (priority !== undefined) payload.priority = priority;
      if (subject !== undefined) payload.subject = subject;
      if (assignee_user_id !== undefined)
        payload.assignee_user = { id: assignee_user_id };
      if (assignee_team_id !== undefined)
        payload.assignee_team = { id: assignee_team_id };
      if (tags !== undefined)
        payload.tags = tags.map((name) => ({ name }));

      const updated = await client.updateTicket(
        ticketId,
        payload,
      );

      const summary = [
        `Ticket #${updated.id} updated`,
        `Subject: ${updated.subject}`,
        `Status: ${updated.status} | Priority: ${updated.priority}`,
        updated.assignee_user
          ? `Assignee: ${updated.assignee_user.name} <${updated.assignee_user.email}>`
          : "Assignee: Unassigned",
        updated.assignee_team
          ? `Team: ${updated.assignee_team.name}`
          : null,
        updated.tags.length > 0
          ? `Tags: ${updated.tags.map((t) => t.name).join(", ")}`
          : null,
        `Updated: ${updated.updated_datetime}`,
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
