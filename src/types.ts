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
}
