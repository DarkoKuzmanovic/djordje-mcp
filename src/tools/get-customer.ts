import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";

export function registerGetCustomer(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "get_customer",
    "Fetch Gorgias customer details by ID.",
    { customer_id: z.number().describe("Gorgias customer ID") },
    async ({ customer_id }) => {
      const c = await client.getCustomer(customer_id);

      const channels = c.channels
        .map((ch) => `${ch.type}: ${ch.address}${ch.preferred ? " (preferred)" : ""}`)
        .join("\n  ");

      const summary = [
        `Customer #${c.id}: ${c.name}`,
        `Email: ${c.email}`,
        c.channels.length > 0 ? `Channels:\n  ${channels}` : null,
        `Total tickets: ${c.nb_tickets}`,
        c.language ? `Language: ${c.language}` : null,
        c.timezone ? `Timezone: ${c.timezone}` : null,
        c.note ? `Note: ${c.note}` : null,
        `Created: ${c.created_datetime}`,
      ]
        .filter(Boolean)
        .join("\n");

      return { content: [{ type: "text", text: summary }] };
    },
  );
}
