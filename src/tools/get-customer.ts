import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient } from "../gorgias-client.js";

export function registerGetCustomer(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "get_customer",
    "Fetch Gorgias customer details by ID or email address.",
    {
      customer_id: z.number().optional().describe("Gorgias customer ID"),
      email: z.string().email().optional().describe("Customer email address"),
    },
    async ({ customer_id, email }) => {
      if (!customer_id && !email) {
        return {
          content: [{ type: "text", text: "Please provide either customer_id or email." }],
          isError: true,
        };
      }

      let c;
      if (customer_id) {
        c = await client.getCustomer(customer_id);
      } else {
        const result = await client.searchCustomers({ email: email! });
        if (result.data.length === 0) {
          return {
            content: [{ type: "text", text: `No customer found with email: ${email}` }],
          };
        }
        c = result.data[0];
      }

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
