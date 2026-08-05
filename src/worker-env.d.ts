// Ambient type declarations for modules the worker bundles but tsc cannot resolve.

// schema.sql is imported by src/routes/admin.ts and inlined as text by wrangler.
declare module '*.sql' {
  const content: string;
  export default content;
}
