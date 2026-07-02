/**
 * Step 4: Broadcasting Queue Worker
 * Cloudflare Queues consumer handling bulk WhatsApp broadcast messages asynchronously.
 */
import type { CloudflareEnv } from "@/lib/cloudflare";

const broadcastQueueWorker = {
  async queue(batch: any, env: CloudflareEnv): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const { campaignId, workspaceId, contactId, phoneId, textBody } = msg.body;
        
        // 1. Fetch contact details (phone number) from D1
        const contact = await env.DB.prepare(
          "SELECT platform_contact_id FROM contacts WHERE id = ? AND workspace_id = ? AND platform = 'whatsapp'"
        ).bind(contactId, workspaceId).first<{ platform_contact_id: string }>();

        if (!contact) {
          throw new Error(`Contact not found: ${contactId}`);
        }

        // 2. Fetch WhatsApp token from Secure KV
        const token = await env.SECRETS_KV.get("META_USER_ACCESS_TOKEN");
        if (!token) throw new Error("Meta Access Token missing in KV");

        // 3. Make the API Call to Meta WhatsApp Cloud API
        const response = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: contact.platform_contact_id,
            type: "text",
            text: { body: textBody }
          })
        });

        // 4. Record Success/Failure in D1 Campaign Stats
        if (response.ok) {
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET successful_sends = successful_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
        } else {
          console.error("WhatsApp Send Failed:", await response.text());
          await env.DB.prepare(
            "UPDATE broadcast_campaigns SET failed_sends = failed_sends + 1 WHERE id = ?"
          ).bind(campaignId).run();
        }
        
        // Mark message as processed successfully
        msg.ack();

      } catch (err) {
        console.error("Queue Processing Error for message:", msg.id, err);
        // Optional: msg.retry() if it's considered recoverable
      }
    }
  }
};

export default broadcastQueueWorker;
