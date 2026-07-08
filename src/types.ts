/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any;
  NOTIFICATION_QUEUE: Queue<any>;
  ENVIRONMENT: string;
  EMAIL_SENDER: any;
}
