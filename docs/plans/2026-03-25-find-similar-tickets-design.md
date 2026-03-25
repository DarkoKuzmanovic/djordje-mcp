# Find Similar Tickets — Design

## Problem

When a customer writes in with an issue (e.g., "my RSR steering wheel display stopped working"), agents need to find how similar problems were resolved in the past. Currently there's no full-text search in Djordje — the `search_tickets` tool only supports structured filters (status, customer, assignee). The `q` parameter was added but doesn't work with the Gorgias `/tickets` endpoint.

## Solution

Add a `find_similar_tickets` MCP tool that searches past tickets by text similarity and returns relevant context for Claude to synthesize an answer.

## Changes

### 1. `gorgias-client.ts` — Add `search()` method

New method calling `POST /api/search`:

```ts
async search(query: string, size?: number): Promise<GorgiasSearchResult>
```

- Body: `{ type: "ticket", query, size: size ?? 10 }`
- Returns ticket objects with id, subject, status, customer, etc.

Also remove the broken `q` param from `searchTickets()`.

### 2. `search-tickets.ts` — Remove `q` param

- Remove the `q` field from the Zod schema
- Update the tool description to clarify it's for structured filtering only
- Remove `q` from the `searchTickets()` client method

### 3. New `find-similar-tickets.ts`

**Input:**
- `ticket` (string, required) — ticket ID or Gorgias URL
- `depth` (`"summary"` | `"full"`, default `"summary"`)
- `limit` (number, default 5) — max similar tickets to return

**Flow:**
1. Fetch source ticket via `getTicket()`
2. Fetch source ticket's messages to get the first customer message
3. Search using the ticket subject via `POST /api/search`
4. Filter out the source ticket from results
5. For each match (up to `limit`):
   - **summary**: fetch messages, extract first customer message + last agent reply
   - **full**: fetch and return all messages
6. Format output

**Output format (summary):**
```
Source ticket #254125676: Porsche rsr steering wheel (open)
Customer message: "I have a Porsche RSR steering wheel, but it suddenly stopped working..."

Found 3 similar ticket(s):

--- Similar #1 ---
#12345 | closed | RSR wheel display blank after firmware update
Customer: Jane Doe <jane@example.com>
Tags: [hardware, rsr-wheel]

[Customer] (2026-01-15):
My RSR steering wheel display stopped working after...

[Agent] (2026-01-16):
Hi Jane, this is a known issue with firmware v2.3...
```

With `depth: "full"`, the message section expands to the complete thread.
