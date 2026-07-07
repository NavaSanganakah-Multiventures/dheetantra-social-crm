/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  INBOX_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any; // Workflow interface
  NOTIFICATION_QUEUE: Queue<any>;
  BROADCAST_QUEUE: any; // Queue for WhatsApp bulk sending
  POST_PUBLISHER_WORKFLOW: any; // Workflow for scheduling posts
  ENVIRONMENT: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_API_TOKEN: string;
  META_APP_SECRET: string; // Meta app secret for signed_request verification
  FCM_SERVICE_ACCOUNT_JSON?: string; // Firebase service account JSON string
  EMAIL_SENDER: any; // Cloudflare Send Email Binding
  TURN_KEY_ID: string; // Cloudflare Realtime TURN Key ID
  TURN_KEY_API_TOKEN: string; // Cloudflare Realtime TURN API Token
  CLOUDFLARE_CALLS_APP_ID: string; // Cloudflare Calls / TURN app id
  CLOUDFLARE_API_TOKEN: string; // Cloudflare API token for TURN credentials
  GEMINI_API_KEY: string;
}
