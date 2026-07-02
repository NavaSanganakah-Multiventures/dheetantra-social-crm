# Dhitantra - Cloudflare Architecture Blueprint

**Dhitantra** is a Social Media Management & CRM platform built entirely on the Cloudflare ecosystem using the "Workers with Assets" model. 

## 1. Project Folder Structure

```text
/dhitantra-project
├── /assets_build          # Compiled Frontend Assets (Tailwind CSS, HTML, JS). Served directly via Workers with Assets.
├── /src
│   ├── /api               # B2B & B2C API Routes (Hono.js or similar router)
│   ├── /durable-objects   # Real-time Chat and WebSockets logic (Uses native SQLite)
│   ├── /workflows         # Cloudflare Workflows for background tasks and automation
│   ├── /services          # Business Logic & FCM (Firebase Cloud Messaging) integration
│   └── index.ts           # Main Cloudflare Worker Entry Point
├── /db_migrations         # Migration files for Cloudflare D1
├── schema.sql             # Relational schema defining RBAC and Multi-tenancy
├── wrangler.toml          # Worker configuration mapping environments and bindings
└── tailwind.config.js     # Tailwind CSS configuration for the frontend
```

## 2. API Strategy (B2B & B2C)

- **Multi-Tenancy:** Every API request must include a valid `workspace_id` or `tenant_id`. All database queries isolate data per tenant.
- **Authentication:** 
  - API Key authentication mapped to subscription tiers in D1.
  - JWT/OTP for standard users (B2C & CRM staff) stored in Cloudflare KV for fast session validation.
- **SDK Compatibility:** The API responses follow a strict REST/JSON structure mapped to an OpenAPI spec, ensuring seamless code generation for the custom Flutter SDK.
- **Push Notifications:** The `services/fcm.ts` module directly communicates with Firebase Cloud Messaging (FCM) API from the Worker to send push notifications to mobile/web clients.

## 3. Security, RBAC & Performance

- **Environment Separation:** Strict isolation between `[env.production]` and `[env.preview]` in `wrangler.toml`. Separate D1, R2, and KV namespaces prevent data mixing.
- **RBAC (Role-Based Access Control):** Permissions are structurally enforced at the database level. `users` and `roles` tables dictate access to specific CRM and Social Media features.
- **Cloudflare Shield:** API Shield and Bot Management policies will be applied via the Cloudflare Dashboard to protect the API endpoints from malicious traffic.
- **No Pages:** By using "Workers with Assets", we eliminate Pages dependencies, reducing complexity and serving static bundles at the edge with custom backend routing.
