/**
 * Step 5: Post Publishing Workflow Worker
 * Using Cloudflare Workflows for scheduling Facebook & Instagram posts with fault-tolerance.
 */
import type { CloudflareEnv } from "../lib/cloudflare";

export class PostPublisherWorkflow {
  env: CloudflareEnv;

  constructor(env: CloudflareEnv) {
    this.env = env;
  }

  async run(event: any, step: any) {
    const { postId, workspaceId, platform, content, mediaUrls } = event.payload;

    try {
      // Step 1: Load the scheduled post and wait durably until its time.
      const scheduledFor = await step.do("Load scheduled post", async () => {
        const post = await this.env.DB.prepare(
          "SELECT scheduled_for FROM scheduled_posts WHERE id = ?"
        ).bind(postId).first<{ scheduled_for: string }>();

        if (!post) throw new Error("Post has been deleted or missing.");
        return post.scheduled_for;
      });

      const targetTime = new Date(scheduledFor).getTime();
      const delayMs = targetTime - Date.now();

      // step.sleep is durable across workflow pauses (unlike setTimeout).
      if (delayMs > 0) {
        await step.sleep("Wait until scheduled time", delayMs);
      }

      // Step 2: Fetch the meta token
      const token = await step.do("Fetch Meta Details", async () => {
        const secret = (await this.env.SECRETS_KV.get("WHATSAPP_API_TOKEN")) ||
          (await this.env.SECRETS_KV.get("META_USER_ACCESS_TOKEN"));
        if (!secret) throw new Error("Missing Meta Access Token");
        return secret;
      });

      // Step 3: Publish to Target Platform
      await step.do("Publish Payload to Meta", async () => {
        // Resolve the page ID from configuration rather than a hardcoded value.
        const key = platform === 'instagram' ? "META_IG_PAGE_ID" : "META_FB_PAGE_ID";
        const pageId = await this.env.SECRETS_KV.get(key);
        if (!pageId) throw new Error(`Missing ${key} in KV`);

        if (platform === 'instagram') {
          // Instagram requires: create a media container, then publish it.
          const containerRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/media`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                caption: content,
                image_url: mediaUrls && mediaUrls.length > 0 ? mediaUrls[0] : undefined,
                access_token: token,
              }),
            }
          );
          const container: any = await containerRes.json();
          if (container.error) throw new Error(`Instagram container error: ${JSON.stringify(container.error)}`);
          if (!container.id) throw new Error("Instagram container creation failed");

          const publishRes = await fetch(
            `https://graph.facebook.com/v19.0/${pageId}/media_publish`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creation_id: container.id, access_token: token }),
            }
          );
          if (!publishRes.ok) {
            const errorText = await publishRes.text();
            throw new Error(`Instagram publish error: ${errorText}`);
          }
        } else {
          // Facebook Page feed publish
          const requestBody: any = { message: content, access_token: token };
          if (mediaUrls && mediaUrls.length > 0) {
            requestBody.link = mediaUrls[0];
          }
          const response = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
          });
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta API error: ${errorText}`);
          }
        }
      });

      // Step 4: Update Post Status in D1
      await step.do("Update status to published", async () => {
        await this.env.DB.prepare(
          "UPDATE scheduled_posts SET status = 'published' WHERE id = ?"
        ).bind(postId).run();
      });

    } catch (e: any) {
      // Hard failure path
      await step.do("Mark as failed", async () => {
        await this.env.DB.prepare(
          "UPDATE scheduled_posts SET status = 'failed' WHERE id = ?"
        ).bind(postId).run();
      });
      console.error("Workflow failed for PostID:", postId, e);
    }
  }
      });

      // Step 2: Fetch the meta token
      const token = await step.do("Fetch Meta Details", async () => {
          const secret = await this.env.SECRETS_KV.get("META_USER_ACCESS_TOKEN");
          if (!secret) throw new Error("Missing Meta Access Token");
          return secret;
      });

      // Step 3: Publish to Target Platform
      await step.do("Publish Payload to Meta", async () => {
          const pageId = "DEFAULT_FB_IG_PAGE_ID"; // Usually looked up per workspace
          let apiUrl = `https://graph.facebook.com/v18.0/${pageId}/feed`; // Default to FB Page

          const requestBody: any = { message: content, access_token: token };

          if (platform === 'instagram') {
             // Instagram publishing takes multiple steps (Container creation -> Publish)
             // Simplified here for demonstration
             apiUrl = `https://graph.facebook.com/v18.0/${pageId}/media`;
             if (mediaUrls && mediaUrls.length > 0) {
                 requestBody.image_url = mediaUrls[0];
                 requestBody.caption = content;
             }
          } else {
             // Facebook Page Publish
             if (mediaUrls && mediaUrls.length > 0) {
                 requestBody.link = mediaUrls[0]; // Simplified FB link attachment
             }
          }

          const response = await fetch(apiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`Meta API error: ${errorText}`);
          }
      });

      // Step 4: Update Post Status in D1
      await step.do("Update status to published", async () => {
          await this.env.DB.prepare(
            "UPDATE scheduled_posts SET status = 'published' WHERE id = ?"
          ).bind(postId).run();
      });

    } catch (e: any) {
      // Hard failure path
      await step.do("Mark as failed", async () => {
         await this.env.DB.prepare(
             "UPDATE scheduled_posts SET status = 'failed' WHERE id = ?"
         ).bind(postId).run();
      });
      console.error("Workflow failed for PostID:", postId, e);
    }
  }
}
