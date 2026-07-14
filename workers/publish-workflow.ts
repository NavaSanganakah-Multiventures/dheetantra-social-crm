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
      // Step 1: Wait until the scheduled time
      // In Next.js api we passed the actual delay, or we can just fetch from DB when the schedule hits.
      await step.do("Wait until scheduled time", async () => {
         const post = await this.env.DB.prepare(
            "SELECT scheduled_for FROM scheduled_posts WHERE id = ?"
         ).bind(postId).first<{ scheduled_for: string }>();

         if (!post) throw new Error("Post has been deleted or missing.");

         const targetTime = new Date(post.scheduled_for).getTime();
         const delayMs = targetTime - Date.now();
         
         if (delayMs > 0) {
           // We throw an exception/backoff strategy (or use step.sleep based on Cloudflare Workflow capabilities)
           await new Promise((resolve) => setTimeout(resolve, delayMs));
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
