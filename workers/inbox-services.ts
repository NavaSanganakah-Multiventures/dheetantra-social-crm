/**
 * Cloudflare Workers implementation for the Inbox Durable Object and Email Receiver.
 * Note: Next.js Edge Runtime doesn't natively host Durable Object classes or Email handlers nicely.
 * These are typically deployed as a standalone worker or via a combined wrangler.toml setup.
 */

// 1. DURABLE OBJECT: Manages Real-time WebSockets per Workspace
declare const WebSocketPair: any;

export class InboxRealtime {
  state: any;
  sessions: Map<WebSocket, any>;

  constructor(state: any, env: any) {
    this.state = state;
    this.sessions = new Map();
  }

  async fetch(request: Request) {
    const url = new URL(request.url);

    // Internal API to broadcast a message from Webhooks
    if (url.pathname === '/broadcast-internal') {
       const message = await request.json();
       this.broadcast(message);
       return new Response("Broadcasted", { status: 200 });
    }

    // Handle WebSocket Upgrades from clients
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    // Cloudflare specific WebSocket creation
    const { 0: client, 1: server } = new WebSocketPair();
    
    // Accept the socket
    this.state.acceptWebSocket(server);
    this.sessions.set(server, { joinedAt: Date.now() });

    return new Response(null, {
      status: 101,
      webSocket: client,
    } as any);
  }

  // Handle incoming messages from the frontend (typing indicators, read receipts, etc.)
  async webSocketMessage(ws: WebSocket, message: string) {
    try {
      const data = JSON.parse(message);
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch (err) {
       console.error("WS parse error", err);
    }
  }

  async webSocketClose(ws: WebSocket) {
    this.sessions.delete(ws);
  }

  async webSocketError(ws: WebSocket) {
    this.sessions.delete(ws);
  }

  broadcast(message: any) {
    const data = JSON.stringify(message);
    for (const [ws] of this.sessions.entries()) {
      try {
        ws.send(data);
      } catch (err) {
        this.sessions.delete(ws);
      }
    }
  }
}

// 2. EMAIL WORKER: Handles incoming emails via Cloudflare Email Routing
const inboxEmailWorker = {
  async email(message: any, env: any, ctx: any) {
    try {
      const from = message.headers.get("From");
      const to = message.headers.get("To"); // e.g., workspace_id@inbox.yourdomain.com
      const subject = message.headers.get("Subject");
      
      // Basic workspace extraction from email (Implementation specifics depend on your routing rules)
      const workspaceIdMatch = to.match(/^([^@]+)@/);
      const mockWorkspaceId = workspaceIdMatch ? workspaceIdMatch[1] : "default-workspace";
      
      // In a real app, parse the readable stream of the email to get body text using a MIME parser like PostalMime
      const content = `Subject: ${subject}\n\nEmail Body requires Mime parsing via PostalMime.`;

      // 1. Find or Create Contact in D1
      let contact = await env.DB.prepare("SELECT * FROM contacts WHERE platform_contact_id = ? AND platform = 'email'")
        .bind(from).first();

      if (!contact) {
        const contactId = crypto.randomUUID();
        await env.DB.prepare(
            "INSERT INTO contacts (id, workspace_id, platform_contact_id, platform, name) VALUES (?, ?, ?, ?, ?)"
        ).bind(contactId, mockWorkspaceId, from, 'email', from).run();
        contact = { id: contactId };
      }

      // 2. Insert Conversation and Message
      let conversation = await env.DB.prepare(
        "SELECT * FROM conversations WHERE contact_id = ? AND status = 'open'"
      ).bind(contact.id).first();

      if (!conversation) {
        const conversationId = crypto.randomUUID();
        await env.DB.prepare(
            "INSERT INTO conversations (id, workspace_id, contact_id, platform) VALUES (?, ?, ?, ?)"
        ).bind(conversationId, mockWorkspaceId, contact.id, 'email').run();
        conversation = { id: conversationId };
      }

      const messageObj = {
        id: crypto.randomUUID(),
        conversation_id: conversation.id,
        sender_type: 'contact',
        content,
        created_at: new Date().toISOString()
      };

      await env.DB.prepare(
          "INSERT INTO messages (id, conversation_id, sender_type, content) VALUES (?, ?, ?, ?)"
      ).bind(messageObj.id, messageObj.conversation_id, messageObj.sender_type, messageObj.content).run();

      // 3. Notify Durable Object to broadcast to connected Next.js frontends
      if (env.INBOX_DO) {
        const doId = env.INBOX_DO.idFromName(mockWorkspaceId);
        const stub = env.INBOX_DO.get(doId);
        
        // Internal call to DO
        await stub.fetch(new Request("http://internal/broadcast-internal", {
          method: "POST",
          body: JSON.stringify({ type: "new_message", message: messageObj })
        }));
      }

    } catch (e) {
      console.error("Failed to process incoming email mapping:", e);
    }
  }
};

export default inboxEmailWorker;
