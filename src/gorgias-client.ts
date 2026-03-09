export interface GorgiasConfig {
  domain: string;
  email: string;
  apiKey: string;
}

export interface GorgiasTicket {
  id: number;
  uri: string;
  subject: string;
  status: string;
  priority: string;
  channel: string;
  via: string;
  from_agent: boolean;
  customer: {
    id: number;
    email: string;
    name: string;
  };
  assignee_user: {
    id: number;
    email: string;
    name: string;
  } | null;
  assignee_team: {
    id: number;
    name: string;
  } | null;
  tags: Array<{ id: number; name: string }>;
  messages_count: number;
  created_datetime: string;
  opened_datetime: string | null;
  last_received_message_datetime: string | null;
  last_message_datetime: string | null;
  closed_datetime: string | null;
  updated_datetime: string;
  spam: boolean;
  meta: Record<string, unknown>;
}

export interface GorgiasMessage {
  id: number;
  uri: string;
  message_id: string;
  ticket_id: number;
  channel: string;
  via: string;
  source: {
    type: string;
    from: { name: string; address: string };
    to: Array<{ name: string; address: string }>;
  };
  sender: {
    id: number;
    email: string;
    name: string;
  };
  integration_id: number | null;
  intents: unknown[];
  rule_id: number | null;
  from_agent: boolean;
  receiver: {
    id: number;
    email: string;
    name: string;
  } | null;
  subject: string;
  body_text: string;
  body_html: string;
  stripped_text: string;
  stripped_html: string;
  attachments: Array<{
    url: string;
    name: string;
    size: number;
    content_type: string;
  }>;
  meta: Record<string, unknown>;
  headers: Record<string, string>;
  actions: unknown[];
  macros: unknown[];
  created_datetime: string;
  sent_datetime: string | null;
  failed_datetime: string | null;
  deleted_datetime: string | null;
  opened_datetime: string | null;
  last_sending_error: unknown | null;
  is_retriable: boolean;
}

export interface GorgiasCustomer {
  id: number;
  uri: string;
  external_id: string | null;
  active: boolean;
  name: string;
  firstname: string;
  lastname: string;
  email: string;
  channels: Array<{
    id: number;
    type: string;
    address: string;
    preferred: boolean;
  }>;
  meta: Record<string, unknown>;
  data: Record<string, unknown>;
  note: string | null;
  language: string | null;
  timezone: string | null;
  created_datetime: string;
  updated_datetime: string;
  nb_tickets: number;
}

export interface GorgiasPaginatedResponse<T> {
  data: T[];
  meta: {
    next_cursor: string | null;
    previous_cursor: string | null;
  };
}

export interface CreateTicketPayload {
  via: string;
  channel?: string;
  from_agent?: boolean;
  subject?: string;
  status?: string;
  priority?: string;
  customer?: { id?: number; email?: string; name?: string };
  assignee_user?: { id: number } | null;
  assignee_team?: { id: number } | null;
  tags?: Array<{ name: string }>;
  messages: Array<{
    channel: string;
    from_agent: boolean;
    via: string;
    body_text?: string;
    body_html?: string;
    source?: {
      type: string;
      from: { name?: string; address: string };
      to: Array<{ name?: string; address: string }>;
    };
  }>;
}

export interface UpdateTicketPayload {
  status?: string;
  priority?: string;
  subject?: string;
  assignee_user?: { id: number } | null;
  assignee_team?: { id: number } | null;
  tags?: Array<{ name: string }>;
  snooze_datetime?: string | null;
}

export interface CreateMessagePayload {
  channel: string;
  from_agent: boolean;
  via: string;
  body_text?: string;
  body_html?: string;
  source?: {
    type: string;
    from: { name?: string; address: string };
    to: Array<{ name?: string; address: string }>;
  };
  sender?: { id?: number; email?: string };
  receiver?: { id?: number; email?: string };
  integration_id?: number;
}

export class GorgiasClient {
  private baseUrl: string;
  private authHeader: string;
  public readonly email: string;

  constructor(config: GorgiasConfig) {
    this.baseUrl = `https://${config.domain}.gorgias.com/api`;
    this.email = config.email;
    this.authHeader =
      "Basic " +
      Buffer.from(`${config.email}:${config.apiKey}`).toString("base64");
  }

  private async request<T>(
    path: string,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Gorgias API error ${response.status}: ${response.statusText} — ${body}`,
      );
    }

    return response.json() as Promise<T>;
  }

  private async mutate<T>(
    path: string,
    method: "POST" | "PUT",
    body: Record<string, unknown>,
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Gorgias API error ${response.status}: ${response.statusText} — ${text}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async getTicket(id: number): Promise<GorgiasTicket> {
    return this.request<GorgiasTicket>(`/tickets/${id}`);
  }

  async listTicketMessages(
    ticketId: number,
    limit = 30,
  ): Promise<GorgiasPaginatedResponse<GorgiasMessage>> {
    return this.request<GorgiasPaginatedResponse<GorgiasMessage>>(
      `/tickets/${ticketId}/messages`,
      { limit },
    );
  }

  async getCustomer(id: number): Promise<GorgiasCustomer> {
    return this.request<GorgiasCustomer>(`/customers/${id}`);
  }

  async createTicketMessage(
    ticketId: number,
    message: CreateMessagePayload,
  ): Promise<GorgiasMessage> {
    return this.mutate<GorgiasMessage>(
      `/tickets/${ticketId}/messages`,
      "POST",
      message as unknown as Record<string, unknown>,
    );
  }

  async createTicket(
    payload: CreateTicketPayload,
  ): Promise<GorgiasTicket> {
    return this.mutate<GorgiasTicket>(
      "/tickets",
      "POST",
      payload as unknown as Record<string, unknown>,
    );
  }

  async updateTicket(
    ticketId: number,
    payload: UpdateTicketPayload,
  ): Promise<GorgiasTicket> {
    return this.mutate<GorgiasTicket>(
      `/tickets/${ticketId}`,
      "PUT",
      payload as unknown as Record<string, unknown>,
    );
  }

  async searchTickets(filters: {
    status?: string;
    customer_id?: number;
    assignee_user_id?: number;
    tag?: string;
    limit?: number;
    cursor?: string;
  }): Promise<GorgiasPaginatedResponse<GorgiasTicket>> {
    return this.request<GorgiasPaginatedResponse<GorgiasTicket>>("/tickets", {
      status: filters.status,
      customer_id: filters.customer_id,
      assignee_user_id: filters.assignee_user_id,
      limit: filters.limit ?? 20,
      cursor: filters.cursor,
    });
  }
}
