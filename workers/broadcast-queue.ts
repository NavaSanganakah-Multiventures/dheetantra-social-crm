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

const broadcastQueueConsumer = {
  async queue(batch: MessageBatch<BroadcastMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const { campaignId, contactId, phoneId, templateName, text, languageCode, parameters, toPhone } = msg.body;

      try {
        // 1. Use phone number from queue message
        if (!toPhone) {
          console.error(`[broadcast-queue] No phone number for contact: ${contactId}`);
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
          msg.ack();
          continue;
        }

        // 2. Get access token from DB per phone number config
        const config = await env.DB.prepare(
          'SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?'
        ).bind(phoneId).first<{ access_token: string }>();

        if (!config || !config.access_token) {
          console.error(`[broadcast-queue] No access_token found for phoneId: ${phoneId}`);
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
          msg.ack();
          continue;
        }

        const token = config.access_token;

        // 3. Build template components
        const components: any[] = [];
        if (parameters && parameters.length > 0) {
          components.push({
            type: 'body',
            parameters: parameters.map(p => ({ type: 'text', text: p }))
          });
        }

        // 4. Decide message type: free-form text (no templateName) or template
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

        // 4. Send message via Meta WhatsApp Cloud API
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        // 4. Record success or failure
        if (response.ok) {
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET successful_sends = successful_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
        } else {
          const errBody = await response.text();
          console.error(`[broadcast-queue] WhatsApp API error for contact ${contactId}:`, errBody);
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
        }

        msg.ack();
      } catch (err) {
        console.error(`[broadcast-queue] Error processing message ${msg.id}:`, err);
        await env.DB.prepare(
          "UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?"
        ).bind(campaignId).run();
        msg.ack();
      }
    }
  }
};

export default broadcastQueueConsumer;
