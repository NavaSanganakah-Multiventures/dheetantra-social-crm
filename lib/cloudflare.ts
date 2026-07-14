import type { NextRequest } from 'next/server';
import type { Env } from '../src/types';

/**
 * Cloudflare Environment Bindings.
 * These match the bindings configured in your wrangler.toml or Cloudflare dashboard.
 * Re-exported from the canonical `Env` type so the Worker, Workers and libs stay in sync.
 */
export type CloudflareEnv = Env;

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
