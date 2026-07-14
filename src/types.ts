/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  MEDIA_BUCKET: R2Bucket;
  CHAT_DO: DurableObjectNamespace;
  INBOX_DO: DurableObjectNamespace;
  AUTOMATION_WORKFLOW: any;
  NOTIFICATION_QUEUE: Queue<any>;
  BROADCAST_QUEUE: any;
  POST_PUBLISHER_WORKFLOW: any;
  ENVIRONMENT: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_API_TOKEN: string;
  META_APP_SECRET: string;
  FCM_SERVICE_ACCOUNT_JSON?: string;
  EMAIL_SENDER: any;
  EMAIL_SENDER_ADDRESS?: string;
  TURN_KEY_ID: string;
  TURN_KEY_API_TOKEN: string;
  CLOUDFLARE_CALLS_APP_ID: string;
  CLOUDFLARE_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  CF_GATEWAY_ID: string;
  CF_API_TOKEN: string;
}
