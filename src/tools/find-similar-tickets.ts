import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GorgiasClient, GorgiasMessage, GorgiasSearchHit } from "../gorgias-client.js";
import { parseTicketId } from "../utils/parse-ticket-url.js";

export function registerFindSimilarTickets(
  server: McpServer,
  client: GorgiasClient,
) {
  server.tool(
    "find_similar_tickets",
    "Find past tickets similar to a given ticket and show how they were resolved. Use this to research answers based on previous support interactions. Try summary depth first; use full if you need more detail.",
    {
      ticket: z.string().describe("Ticket ID or Gorgias ticket URL"),
      depth: z
        .enum(["summary", "full"])
        .optional()
        .default("summary")
        .describe(
          "summary = first customer message + last agent reply per match (default). full = complete message threads.",
        ),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Max similar tickets to return (default 5)"),
    },
    async ({ ticket, depth, limit }) => {
      const sourceId = parseTicketId(ticket);

      // Fetch source ticket and its messages
      const [sourceTicket, sourceMessages] = await Promise.all([
        client.getTicket(sourceId),
        client.listTicketMessages(sourceId),
      ]);

      const firstCustomerMsg = sourceMessages.data.find((m) => !m.from_agent);

      // Search using the ticket subject
      const searchHits = await client.search(sourceTicket.subject, limit + 5);

      // Filter out the source ticket
      const hits = searchHits
        .filter((h: GorgiasSearchHit) => h.id !== sourceId)
        .slice(0, limit);

      if (hits.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No similar tickets found for #${sourceId}: ${sourceTicket.subject}`,
            },
          ],
        };
      }

      // Fetch messages for each matching ticket
      const matchMessages = await Promise.all(
        hits.map((h) => client.listTicketMessages(h.id)),
      );

      // Build output
      const lines: string[] = [
        `Source ticket #${sourceId}: ${sourceTicket.subject} (${sourceTicket.status})`,
      ];
      if (firstCustomerMsg) {
        lines.push(
          `Customer message: "${truncate(firstCustomerMsg.body_text || firstCustomerMsg.stripped_text, 300)}"`,
        );
      }
      lines.push("", `Found ${hits.length} similar ticket(s):`, "");

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const messages = matchMessages[i].data;

        lines.push(`--- Similar #${i + 1} ---`);
        lines.push(
          `#${hit.id} | ${hit.status} | ${hit.subject}`,
        );
        lines.push(
          `Customer: ${hit.customer?.name || "Unknown"} <${hit.customer?.email || "?"}>`,
        );
        if (hit.tags?.length > 0) {
          lines.push(
            `Tags: [${hit.tags.map((t) => t.name).join(", ")}]`,
          );
        }
        lines.push("");

        if (depth === "full") {
          for (const msg of messages) {
            const role = msg.from_agent ? "Agent" : "Customer";
            const date = msg.created_datetime.slice(0, 10);
            const body = msg.body_text || msg.stripped_text || "(no text)";
            lines.push(`[${role}] (${date}):`);
            lines.push(truncate(body, 1000));
            lines.push("");
          }
        } else {
          const firstCust = messages.find((m) => !m.from_agent);
          const lastAgent = findLastAgentReply(messages);

          if (firstCust) {
            const date = firstCust.created_datetime.slice(0, 10);
            const body =
              firstCust.body_text || firstCust.stripped_text || "(no text)";
            lines.push(`[Customer] (${date}):`);
            lines.push(truncate(body, 500));
            lines.push("");
          }
          if (lastAgent) {
            const date = lastAgent.created_datetime.slice(0, 10);
            const body =
              lastAgent.body_text || lastAgent.stripped_text || "(no text)";
            lines.push(`[Agent] (${date}):`);
            lines.push(truncate(body, 500));
            lines.push("");
          }
          if (!firstCust && !lastAgent) {
            lines.push("(no messages)", "");
          }
        }
      }

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    },
  );
}

function findLastAgentReply(messages: GorgiasMessage[]): GorgiasMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].from_agent) return messages[i];
  }
  return undefined;
}

function truncate(text: string, maxLen: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen) + "...";
}
