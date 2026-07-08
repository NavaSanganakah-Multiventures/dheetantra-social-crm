import type { Env } from "../src/types";

interface BroadcastMessage {
  campaignId: string;
  workspaceId: string;
  contactId: string;
  phoneId: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  toPhone: string;
}

const broadcastQueueConsumer = {
  async queue(batch: MessageBatch<BroadcastMessage>, env: Env): Promise<void> {
    // Get access token from KV (cached across batch)
    const token = await env.SECRETS_KV.get("META_USER_ACCESS_TOKEN");
    if (!token) {
      console.error("[broadcast-queue] Meta Access Token missing in KV — cannot process batch");
      for (const msg of batch.messages) {
        await env.DB.prepare(
          "UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?"
        ).bind(msg.body.campaignId).run();
        msg.ack();
      }
      return;
    }

    for (const msg of batch.messages) {
      const { campaignId, contactId, phoneId, templateName, languageCode, parameters, toPhone } = msg.body;

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

        // 2. Build template components
        const components: any[] = [];
        if (parameters && parameters.length > 0) {
          components.push({
            type: 'body',
            parameters: parameters.map(p => ({ type: 'text', text: p }))
          });
        }

        // 3. Send template message via Meta WhatsApp Cloud API
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: toPhone,
            type: "template",
            template: {
              name: templateName,
              language: { code: languageCode || "en_US" },
              components: components.length > 0 ? components : undefined
            }
          })
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
