import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import type { NextRequest } from 'next/server';

/**
 * Cloudflare Environment Bindings.
 * These match the bindings configured in your wrangler.toml or Cloudflare dashboard.
 */
export interface CloudflareEnv {
  DB: D1Database;
  SECRETS_KV: KVNamespace;
  EMAIL_SENDER: any; // send_email binding for Cloudflare Email Routing
  INBOX_DO: any; // DurableObjectNamespace for Real-time WebSocket connections
  BROADCAST_QUEUE: any; // Queue for WhatsApp bulk sending
  POST_PUBLISHER_WORKFLOW: any; // Workflow for scheduling posts
  MEDIA_BUCKET: any; // R2Bucket for image/video storage
  FCM_SERVICE_ACCOUNT_JSON?: string; // Firebase service account JSON string
}

/**
 * Helper to safely extract Cloudflare Environment variables in the Next.js Edge Runtime.
 * When deployed via @cloudflare/next-on-pages, environment bindings are passed 
 * directly to the request context.
 */
export function getRequestContext(req: NextRequest): { env: CloudflareEnv } {
  // In a robust next-on-pages deployment, you would use:
  // import { getRequestContext as getCFContext } from '@cloudflare/next-on-pages'
  // return getCFContext();
  
  // For standard edge routes in production/development simulation:
  return {
    env: process.env as unknown as CloudflareEnv,
  };
}
