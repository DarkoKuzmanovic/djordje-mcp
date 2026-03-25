import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";

export function registerSearchTickets(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "search_tickets",
    "Filter Gorgias tickets by status, customer, assignee, or email. For full-text search, use find_similar_tickets instead.",
    {
      status: z
        .enum(["open", "closed", "unresolved"])
        .optional()
        .describe("Filter by ticket status"),
      customer_id: z.number().optional().describe("Filter by customer ID"),
      customer_email: z
        .string()
        .optional()
        .describe("Filter by customer email address"),
      assignee_user_id: z
        .number()
        .optional()
        .describe("Filter by assignee user ID"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Max results (default 20)"),
      cursor: z
        .string()
        .optional()
        .describe("Pagination cursor from previous response"),
    },
    async (params) => {
      const result = await client.searchTickets(params);

      if (result.data.length === 0) {
        return { content: [{ type: "text", text: "No tickets found matching the filters." }] };
      }

      const lines = result.data.map((t) => {
        const assignee = t.assignee_user?.name ?? "Unassigned";
        const tags = t.tags.length > 0 ? ` [${t.tags.map((tag) => tag.name).join(", ")}]` : "";
        return `#${t.id} | ${t.status} | ${t.subject} | ${t.customer.name} | ${assignee}${tags}`;
      });

      let text = `Found ${result.data.length} ticket(s):\n\n${lines.join("\n")}`;
      if (result.meta.next_cursor) {
        text += `\n\n(More results available — use cursor: "${result.meta.next_cursor}")`;
      }

      return { content: [{ type: "text", text }] };
    },
  );
}
