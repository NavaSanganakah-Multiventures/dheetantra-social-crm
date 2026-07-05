/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any; // Workflow interface
  NOTIFICATION_QUEUE: Queue<any>;
  ENVIRONMENT: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_API_TOKEN: string;
  EMAIL_SENDER: any; // Cloudflare Send Email Binding
  TURN_KEY_ID: string; // Cloudflare Realtime TURN Key ID
  TURN_KEY_API_TOKEN: string; // Cloudflare Realtime TURN API Token
  CF_ACCOUNT_ID: string;
  CF_GATEWAY_ID: string;
  CF_API_TOKEN: string;
}
