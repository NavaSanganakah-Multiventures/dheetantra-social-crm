import type { Env } from "../src/types";

interface BroadcastMessage {
  campaignId: string;
  workspaceId: string;
  contactId: string;
  phoneId: string;
  templateName?: string;
  text?: string;
  languageCode?: string;
  parameters?: string[];
  toPhone: string;
}

// Find or create the WhatsApp conversation for a contact so the broadcast
// message can be recorded in the chat thread (mirrors /api/whatsapp/templates/send).
async function ensureConversation(env: Env, workspaceId: string, contactId: string, phoneId: string): Promise<string | null> {
  try {
    let conv = await env.DB.prepare(
      'SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND phone_number_id = ?'
    ).bind(workspaceId, contactId, phoneId).first<{ id: string }>();

    if (!conv) {
      // Fallback for older conversations without phone_number_id set
      conv = await env.DB.prepare(
        'SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND phone_number_id IS NULL'
      ).bind(workspaceId, contactId).first<{ id: string }>();
      if (conv) {
        await env.DB.prepare('UPDATE conversations SET phone_number_id = ? WHERE id = ?').bind(phoneId, conv.id).run();
      }
    }

    let convId = conv?.id;
    if (!convId) {
      convId = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO conversations (id, workspace_id, contact_id, platform, status, phone_number_id) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(convId, workspaceId, contactId, 'whatsapp', 'open', phoneId).run();
    }
    return convId;
  } catch (e) {
    console.error('[broadcast-queue] ensureConversation failed:', e);
    return null;
  }
}

// Save the sent broadcast message into the contact's conversation and push it
// over the workspace WebSocket so the chat shows the outgoing message live.
async function recordSentMessage(env: Env, workspaceId: string, convId: string, content: string, platformMsgId: string | null) {
  const msgId = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(
      'INSERT INTO messages (id, conversation_id, sender_type, message_type, content, platform_message_id, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(msgId, convId, 'agent', 'text', content || null, platformMsgId || null, 'whatsapp', now).run();
  } catch (e) {
    console.error('[broadcast-queue] Failed to record sent message in conversation:', e);
    return;
  }

  try {
    const doId = env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const stub = env.CHAT_DO.get(doId);
    await stub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'new_message',
        message: {
          id: msgId,
          conversation_id: convId,
          sender_type: 'agent',
          message_type: 'text',
          content: content || null,
          platform_message_id: platformMsgId || null,
          platform: 'whatsapp',
          status: 'sent',
          created_at: now,
        },
      }),
    }));
  } catch (e) {
    console.error('[broadcast-queue] DO broadcast failed:', e);
  }
}

const broadcastQueueConsumer = {
  async queue(batch: MessageBatch<BroadcastMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { campaignId, workspaceId, contactId, phoneId, templateName, text, languageCode, parameters, toPhone } = msg.body;

      const recordFailure = async (reason: string) => {
        console.error(`[broadcast-queue] send failed for contact ${contactId} (${toPhone}): ${reason}`);
        try {
          await env.DB.prepare("UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?").bind(campaignId).run();
        } catch (e) {
          console.error('[broadcast-queue] failed to increment failed_sends:', e);
        }
      };

      try {
        if (!toPhone) {
          await recordFailure('no phone number for contact');
          msg.ack();
          continue;
        }

        // Get the access token for this phone number config
        const config = await env.DB.prepare(
          'SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?'
        ).bind(phoneId).first<{ access_token: string }>();

        if (!config || !config.access_token) {
          await recordFailure(`no access_token found for phoneId: ${phoneId}`);
          msg.ack();
          continue;
        }
        const token = config.access_token;

        // Build template components (only for template mode)
        const components: any[] = [];
        if (parameters && parameters.length > 0) {
          components.push({
            type: 'body',
            parameters: parameters.map(p => ({ type: 'text', text: p }))
          });
        }

        // Decide message type: free-form text (no templateName) or template.
        // Both go out via the official WhatsApp Cloud API (Graph API).
        const isText = !templateName;
        const payload: any = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toPhone
        };

        if (isText) {
          payload.type = "text";
          payload.text = { body: text || '' };
        } else {
          payload.type = "template";
          payload.template = {
            name: templateName,
            language: { code: languageCode || "en_US" },
            components: components.length > 0 ? components : undefined
          };
        }

        // Send via WhatsApp Cloud API
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        // Parse the response JSON once; detect Meta's error object even on
        // non-2xx so the failure reason is surfaced (not just a bare HTTP code).
        let data: any = null;
        try {
          data = await response.json();
        } catch {
          data = null;
        }

        if (!response.ok || (data && data.error)) {
          await recordFailure(data?.error?.message || `HTTP ${response.status}`);
          msg.ack();
          continue;
        }

        const platformMsgId = data?.messages?.[0]?.id || null;

        // Success: increment campaign counter
        try {
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET successful_sends = successful_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
        } catch (e) {
          console.error('[broadcast-queue] failed to increment successful_sends:', e);
        }

        // Record the sent message in the contact's conversation so it appears
        // in the chat inbox (previously broadcasts were never saved to messages,
        // so the sent message was invisible in the conversation thread).
        const convId = await ensureConversation(env, workspaceId, contactId, phoneId);
        if (convId) {
          const content = isText ? (text || '') : `[Template Message] ${templateName}`;
          await recordSentMessage(env, workspaceId, convId, content, platformMsgId);
        }

        msg.ack();
      } catch (err) {
        await recordFailure(String((err as any)?.message || err));
        msg.ack();
      }
    }
  }
};

export default broadcastQueueConsumer;
