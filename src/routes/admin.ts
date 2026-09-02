/// <reference path="../worker-env.d.ts" />
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { Env } from '../types';

const admin = new Hono<{ Bindings: Env }>();
// Helper function to verify admin permissions
async function verifyAdmin(c: any): Promise<{ user: any } | null> {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) return null;
  if (!c.env.SECRETS_KV) return null;
  
  const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
  if (!userDataStr) return null;

  try {
    const user = JSON.parse(userDataStr);
    const email = user.email?.toLowerCase();
    
    // Check for configured admins list in KV
    let isAdmin = false;
    const adminEmailsConfig = await c.env.SECRETS_KV.get('ADMIN_CONTACT_EMAIL');
    if (adminEmailsConfig) {
      const emailList = adminEmailsConfig.split(',').map((e: string) => e.trim().toLowerCase());
      if (emailList.includes(email)) {
        isAdmin = true;
      }
    }

    return isAdmin ? { user } : null;
  } catch (e) {
    return null;
  }
}

// Check admin status
admin.get('/check', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) {
    return c.json({ isAdmin: false }, 403);
  }
  return c.json({ isAdmin: true, user: isAdmin.user });
});

import schemaSqlContent from '../../schema.sql';
import { diffSchema } from '../schema';

admin.get('/schema-diff', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const diff = await diffSchema(c.env.DB, schemaSqlContent);
    const status = diff.missingTables.length > 0 || diff.missingColumns.length > 0 ? 'needs_migration' : 'up_to_date';
    return c.json({
      status,
      missingTables: diff.missingTables,
      missingColumns: diff.missingColumns,
      extraTables: diff.extraTables,
      summary: `${diff.missingTables.length} tables missing, ${diff.missingColumns.length} columns missing`
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

admin.post('/migrate', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    // Disable foreign keys temporarily
    try { await c.env.DB.prepare('PRAGMA foreign_keys = OFF').run(); } catch (e) { }

    const applied: string[] = [];

    // Run intelligent migration
    const diff = await diffSchema(c.env.DB, schemaSqlContent);
    const stmts: any[] = [];
      
      // Add missing tables
      for (const t of diff.missingTables) {
        stmts.push(c.env.DB.prepare(t.sql));
        applied.push(`CREATE TABLE ${t.name}`);
      }
      
      // Add missing columns
      for (const col of diff.missingColumns) {
        stmts.push(c.env.DB.prepare(col.sql));
        applied.push(`ALTER TABLE ${col.table} ADD COLUMN ${col.column}`);
      }
      
      if (stmts.length > 0) {
        await c.env.DB.batch(stmts);
      }

    // Re-enable foreign keys
    try { await c.env.DB.prepare('PRAGMA foreign_keys = ON').run(); } catch (e) { }

    return c.json({ 
      success: true, 
      applied,
      message: `Migrated successfully! Applied ${applied.length} changes.` 
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

admin.get('/stats', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const usersCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    const workspacesCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM workspaces').first<{ count: number }>();
    const whatsappCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM whatsapp_configs').first<{ count: number }>();
    const messagesCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM messages').first<{ count: number }>();
    const contactsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM contacts').first<{ count: number }>();
    const campaignsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM broadcast_campaigns').first<{ count: number }>();
    const templatesCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM whatsapp_templates').first<{ count: number }>();
    const domainsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM domains').first<{ count: number }>();
    const callsCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM calls').first<{ count: number }>();

    return c.json({
      stats: {
        users: usersCount?.count || 0,
        workspaces: workspacesCount?.count || 0,
        whatsapp: whatsappCount?.count || 0,
        messages: messagesCount?.count || 0,
        contacts: contactsCount?.count || 0,
        campaigns: campaignsCount?.count || 0,
        templates: templatesCount?.count || 0,
        domains: domainsCount?.count || 0,
        calls: callsCount?.count || 0,
      }
    });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET all registered users
admin.get('/users', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
    return c.json({ users: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// CREATE a new user manually
admin.post('/users', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { email, name, is_registered } = await c.req.json();
    if (!email) return c.json({ error: 'Email is required' }, 400);

    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO users (id, email, name, is_registered) VALUES (?, ?, ?, ?)')
      .bind(id, email, name || 'User', is_registered ? 1 : 0)
      .run();

    // Automatically provision a default workspace for this new user
    const workspaceId = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)')
      .bind(workspaceId, `${name || 'User'}'s Workspace`)
      .run();

    await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .bind(workspaceId, id, 'owner')
      .run();

    return c.json({ success: true, user: { id, email, name, is_registered } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// UPDATE user details
admin.put('/users/:id', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const { email, name, is_registered } = await c.req.json();
    if (!email) return c.json({ error: 'Email is required' }, 400);

    await c.env.DB.prepare('UPDATE users SET email = ?, name = ?, is_registered = ? WHERE id = ?')
      .bind(email, name, is_registered ? 1 : 0, id)
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE a user
admin.delete('/users/:id', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET all workspaces with member counts
admin.get('/workspaces', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare(`
      SELECT w.*, p.name as plan_name, 
             (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id) as member_count,
             (SELECT group_concat(u.email) FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = w.id) as member_emails
      FROM workspaces w
      LEFT JOIN plans p ON w.plan_id = p.id
      ORDER BY w.created_at DESC
    `).all();
    return c.json({ workspaces: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// CREATE a workspace
admin.post('/workspaces', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { name, plan_id, owner_id } = await c.req.json();
    if (!name) return c.json({ error: 'Workspace name is required' }, 400);
    if (!owner_id) return c.json({ error: 'Owner user_id is required to create a workspace' }, 400);

    const ownerUser: any = await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(owner_id).first();
    if (!ownerUser) return c.json({ error: 'Owner user not found' }, 404);

    const id = crypto.randomUUID();
    const { getFreePlanId } = await import('../services/subscriptionService');
    const freePlanId = await getFreePlanId(c.env);

    await c.env.DB.prepare('INSERT INTO workspaces (id, name, plan_id) VALUES (?, ?, ?)')
      .bind(id, name, plan_id || freePlanId)
      .run();

    await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .bind(id, owner_id, 'owner')
      .run();

    return c.json({ success: true, workspace: { id, name, plan_id: plan_id || freePlanId } });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// UPDATE a workspace details or plan
admin.put('/workspaces/:id', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const { name, plan_id } = await c.req.json();
    if (!name) return c.json({ error: 'Workspace name is required' }, 400);

    await c.env.DB.prepare('UPDATE workspaces SET name = ?, plan_id = ? WHERE id = ?')
      .bind(name, plan_id || null, id)
      .run();

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE a workspace
admin.delete('/workspaces/:id', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM workspaces WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
// ==========================================
// ADMIN WORKSPACE MEMBER MANAGEMENT
// Allows system administrators to add, update and remove members
// for any workspace without being a member of that workspace.
// ==========================================

// Helper: find or create a pending user by email (for admin invites)
async function findOrCreateUserByEmail(env: any, email: string, name?: string) {
  if (!env.DB) return null;
  const normalized = email.toLowerCase().trim();
  const existing: any = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(normalized).first();
  if (existing) return { id: existing.id, created: false };

  const id = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO users (id, email, name, is_registered) VALUES (?, ?, ?, ?)')
    .bind(id, normalized, name || normalized.split('@')[0], 0)
    .run();
  return { id, created: true };
}

// GET workspace members
admin.get('/workspaces/:id/members', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const workspaceId = c.req.param('id');
    const { results } = await c.env.DB.prepare(
      'SELECT u.id, u.email, u.name, wm.role, wm.joined_at ' +
      'FROM workspace_members wm ' +
      'JOIN users u ON wm.user_id = u.id ' +
      'WHERE wm.workspace_id = ? ' +
      "ORDER BY CASE wm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END, u.name")
      .bind(workspaceId).all();
    return c.json({ members: results || [] });
  } catch (err: any) {
    console.error('Admin: failed to list workspace members:', err);
    return c.json({ error: err.message || 'Failed to list members' }, 500);
  }
});

// ADD a member to workspace (create pending user if needed)
admin.post('/workspaces/:id/members', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const workspaceId = c.req.param('id');
    const { email, role = 'member', name } = await c.req.json();
    if (!email || typeof email !== 'string') return c.json({ error: 'Email must be a valid string' }, 400);
    if (!['owner', 'admin', 'member'].includes(role)) {
      return c.json({ error: 'Invalid role. Use owner, admin, or member' }, 400);
    }

    const workspace: any = await c.env.DB.prepare('SELECT id FROM workspaces WHERE id = ?').bind(workspaceId).first();
    if (!workspace) return c.json({ error: 'Workspace not found' }, 404);

    const userResult = await findOrCreateUserByEmail(c.env, email, name);
    if (!userResult) return c.json({ error: 'Database not connected' }, 500);

    const existing: any = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, userResult.id).first();
    if (existing) {
      return c.json({ error: 'User is already a member of this workspace' }, 400);
    }

    await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
      .bind(workspaceId, userResult.id, role).run();

    return c.json({
      success: true,
      createdUser: userResult.created,
      member: { id: userResult.id, email: email.toLowerCase().trim(), role }
    });
  } catch (err: any) {
    console.error('Admin: failed to add workspace member:', err);
    return c.json({ error: err.message || 'Failed to add member' }, 500);
  }
});

// UPDATE member role
admin.put('/workspaces/:id/members/:userId', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const workspaceId = c.req.param('id');
    const targetUserId = c.req.param('userId');
    const { role } = await c.req.json();
    if (!['owner', 'admin', 'member'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    const target: any = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, targetUserId).first();
    if (!target) return c.json({ error: 'Member not found' }, 404);

    if (role !== 'owner' && target.role === 'owner') {
      const ownerCount: any = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ? AND role = ?'
      ).bind(workspaceId, 'owner').first();
      if ((ownerCount?.count || 0) <= 1) {
        return c.json({ error: 'Cannot demote the last owner. Assign another owner first.' }, 400);
      }
    }

    await c.env.DB.prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND user_id = ?')
      .bind(role, workspaceId, targetUserId).run();

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Admin: failed to update workspace member role:', err);
    return c.json({ error: err.message || 'Failed to update role' }, 500);
  }
});

// REMOVE member from workspace
admin.delete('/workspaces/:id/members/:userId', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const workspaceId = c.req.param('id');
    const targetUserId = c.req.param('userId');

    const target: any = await c.env.DB.prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, targetUserId).first();
    if (!target) return c.json({ error: 'Member not found' }, 404);

    if (target.role === 'owner') {
      const ownerCount: any = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM workspace_members WHERE workspace_id = ? AND role = ?'
      ).bind(workspaceId, 'owner').first();
      if ((ownerCount?.count || 0) <= 1) {
        return c.json({ error: 'Cannot remove the last owner. Transfer ownership first.' }, 400);
      }
    }

    await c.env.DB.prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?')
      .bind(workspaceId, targetUserId).run();

    return c.json({ success: true });
  } catch (err: any) {
    console.error('Admin: failed to remove workspace member:', err);
    return c.json({ error: err.message || 'Failed to remove member' }, 500);
  }
});

// GET plans list
admin.get('/plans', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM plans ORDER BY sort_order ASC, upfront_price ASC').all();
    return c.json({ plans: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// CREATE subscription plan
admin.post('/plans', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const {
      id, name, description, upfront_price, pay_as_you_go_rate, features_json, limits_json,
      billing_type, billing_period, billing_interval, currency, is_active, is_free, sort_order,
    } = await c.req.json();
    if (!id || !name) return c.json({ error: 'ID and Name are required' }, 400);

    const plan = {
      id,
      name,
      description: description || '',
      upfront_price: parseFloat(upfront_price) || 0,
      pay_as_you_go_rate: parseFloat(pay_as_you_go_rate) || 0,
      billing_type: billing_type === 'one_time' ? 'one_time' : 'recurring',
      billing_period: billing_period || 'monthly',
      billing_interval: parseInt(billing_interval, 10) || 1,
      currency: currency || 'INR',
      is_active: is_free === 1 || is_active === 1 || is_active === true ? 1 : 0,
      is_free: is_free === 1 || is_free === true ? 1 : 0,
      sort_order: parseInt(sort_order, 10) || 0,
    };

    // Sync a Razorpay plan entity for paid recurring plans
    let razorpay_plan_id: string | null = null;
    if (plan.billing_type === 'recurring' && !plan.is_free && plan.upfront_price > 0) {
      try {
        const { syncRazorpayPlan } = await import('../services/razorpay');
        razorpay_plan_id = await syncRazorpayPlan(c.env, plan);
      } catch (err: any) {
        console.error('[Admin] Razorpay plan sync failed:', err);
      }
    }

    await c.env.DB.prepare(
      `INSERT INTO plans (id, name, description, upfront_price, pay_as_you_go_rate, features_json, limits_json,
        billing_type, billing_period, billing_interval, currency, is_active, is_free, razorpay_plan_id, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      plan.id, plan.name, plan.description, plan.upfront_price, plan.pay_as_you_go_rate,
      features_json || '[]', limits_json || '{}',
      plan.billing_type, plan.billing_period, plan.billing_interval, plan.currency,
      plan.is_active, plan.is_free, razorpay_plan_id, plan.sort_order
    ).run();

    return c.json({ success: true, razorpay_plan_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// UPDATE subscription plan
admin.put('/plans/:id', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const {
      name, description, upfront_price, pay_as_you_go_rate, features_json, limits_json,
      billing_type, billing_period, billing_interval, currency, is_active, is_free, sort_order,
    } = await c.req.json();
    if (!name) return c.json({ error: 'Name is required' }, 400);

    const existing: any = await c.env.DB.prepare('SELECT * FROM plans WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Plan not found' }, 404);

    const plan = {
      id,
      name,
      description: description || '',
      upfront_price: parseFloat(upfront_price) || 0,
      pay_as_you_go_rate: parseFloat(pay_as_you_go_rate) || 0,
      billing_type: billing_type === 'one_time' ? 'one_time' : 'recurring',
      billing_period: billing_period || 'monthly',
      billing_interval: parseInt(billing_interval, 10) || 1,
      currency: currency || 'INR',
      is_active: is_free === 1 || is_active === 1 || is_active === true ? 1 : 0,
      is_free: is_free === 1 || is_free === true ? 1 : 0,
      sort_order: parseInt(sort_order, 10) || 0,
      razorpay_plan_id: existing.razorpay_plan_id || null,
    };

    // Keep the Razorpay plan entity in sync: created on first save, and
    // re-created with a fresh id when the pricing details change (Razorpay
    // plans are immutable). Cosmetic edits PATCH in place.
    if (plan.billing_type === 'recurring' && !plan.is_free && plan.upfront_price > 0) {
      try {
        const { syncRazorpayPlan } = await import('../services/razorpay');
        plan.razorpay_plan_id = await syncRazorpayPlan(c.env, plan);
      } catch (err: any) {
        console.error('[Admin] Razorpay plan sync failed:', err);
      }
    }

    await c.env.DB.prepare(
      `UPDATE plans SET name = ?, description = ?, upfront_price = ?, pay_as_you_go_rate = ?,
        features_json = ?, limits_json = ?, billing_type = ?, billing_period = ?, billing_interval = ?,
        currency = ?, is_active = ?, is_free = ?, razorpay_plan_id = ?, sort_order = ? WHERE id = ?`
    ).bind(
      plan.name, plan.description, plan.upfront_price, plan.pay_as_you_go_rate,
      features_json || '[]', limits_json || '{}',
      plan.billing_type, plan.billing_period, plan.billing_interval, plan.currency,
      plan.is_active, plan.is_free, plan.razorpay_plan_id, plan.sort_order, id
    ).run();

    return c.json({ success: true, razorpay_plan_id: plan.razorpay_plan_id });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE subscription plan
admin.delete('/plans/:id', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(id).run();
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET subscriptions list (admin billing overview)
admin.get('/subscriptions', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT s.*, w.name AS workspace_name, p.name AS plan_name, u.email AS user_email
       FROM subscriptions s
       LEFT JOIN workspaces w ON w.id = s.workspace_id
       LEFT JOIN plans p ON p.id = s.plan_id
       LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.created_at DESC LIMIT 100`
    ).all();
    return c.json({ subscriptions: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET KV secrets list
admin.get('/kv', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.SECRETS_KV) return c.json({ error: 'KV Namespace not configured' }, 500);

  try {
    const listResult = await c.env.SECRETS_KV.list();
    const keysWithValues = [];

    for (const keyObj of listResult.keys) {
      const keyName = keyObj.name;
      let val = '';
      
      // Mask all secret values for security
      if (keyName.startsWith('SESSION:')) {
        val = '[Active User Session Data]';
      } else if (keyName.startsWith('OTP:')) {
        val = '[Verification Code Data]';
      } else {
        val = '********';
      }

      keysWithValues.push({
        name: keyName,
        value: val,
        expiration: keyObj.expiration
      });
    }

    return c.json({ keys: keysWithValues });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// SAVE/UPDATE KV Secret
admin.post('/kv', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.SECRETS_KV) return c.json({ error: 'KV Namespace not configured' }, 500);

  try {
    const { name, value } = await c.req.json();
    if (!name) return c.json({ error: 'Key name is required' }, 400);

    const blockedKeys = ['ADMIN_CONTACT_EMAIL', 'SESSION:', 'OTP:'];
    if (blockedKeys.some(b => name.startsWith(b) || name === b)) {
      return c.json({ error: 'Cannot modify this key via API' }, 403);
    }

    await c.env.SECRETS_KV.put(name, value);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// DELETE KV Secret
admin.delete('/kv/:key', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.SECRETS_KV) return c.json({ error: 'KV Namespace not configured' }, 500);

  try {
    const key = c.req.param('key');
    const blockedKeys = ['ADMIN_CONTACT_EMAIL', 'SESSION:', 'OTP:'];
    if (blockedKeys.some(b => key.startsWith(b) || key === b)) {
      return c.json({ error: 'Cannot delete this key via API' }, 403);
    }
    await c.env.SECRETS_KV.delete(key);
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// GET all API domains
admin.get('/api-domains', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM api_domains ORDER BY created_at DESC').all();
    return c.json({ domains: results });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// VERIFY an API domain
admin.post('/api-domains/:id/verify', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const domainRow = await c.env.DB.prepare('SELECT domain FROM api_domains WHERE id = ?').bind(id).first<{ domain: string }>();
    if (!domainRow) return c.json({ error: 'Domain not found' }, 404);

    await c.env.DB.prepare("UPDATE api_domains SET status = 'verified', blocked_reason = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(id).run();
    if (c.env.SECRETS_KV) {
      await c.env.SECRETS_KV.put(`DOMAIN:${domainRow.domain}`, 'verified');
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// BLOCK an API domain
admin.post('/api-domains/:id/block', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const { reason } = await c.req.json();
    const domainRow = await c.env.DB.prepare('SELECT domain FROM api_domains WHERE id = ?').bind(id).first<{ domain: string }>();
    if (!domainRow) return c.json({ error: 'Domain not found' }, 404);

    await c.env.DB.prepare("UPDATE api_domains SET status = 'blocked', blocked_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(reason || 'Manual block by admin', id).run();
    if (c.env.SECRETS_KV) {
      await c.env.SECRETS_KV.put(`DOMAIN:${domainRow.domain}`, 'blocked');
    }
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// EMAIL DOMAIN REVIEW (protects Cloudflare account)
// ==========================================

admin.get('/domains', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare(`
      SELECT d.*, w.name as workspace_name,
        (SELECT group_concat(u.email) FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = d.workspace_id) as owner_emails
      FROM domains d
      JOIN workspaces w ON d.workspace_id = w.id
      ORDER BY d.created_at DESC
    `).all();
    return c.json({ domains: results || [] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

admin.get('/domains/pending', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare(`
      SELECT d.*, w.name as workspace_name,
        (SELECT group_concat(u.email) FROM workspace_members wm JOIN users u ON wm.user_id = u.id WHERE wm.workspace_id = d.workspace_id) as owner_emails,
        s.status as addon_status, s.current_period_end as addon_period_end
      FROM domains d
      JOIN workspaces w ON d.workspace_id = w.id
      LEFT JOIN addon_subscriptions s ON d.subscription_id = s.id
      WHERE d.review_status = 'pending_review'
      ORDER BY d.created_at ASC
    `).all();
    return c.json({ domains: results || [] });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

admin.post('/domains/:id/approve', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
    if (!row) return c.json({ error: 'Domain not found' }, 404);
    if (row.review_status !== 'pending_review') {
      return c.json({ error: `Domain is already ${row.review_status}` }, 400);
    }
    if (row.billing_status !== 'paid') {
      return c.json({
        error: 'Cannot approve: email add-on payment not verified for this domain.',
        code: 'E_DOMAIN_NOT_PAID',
        billing_status: row.billing_status,
      }, 400);
    }

    // Verify the linked addon subscription is still active before consuming a slot.
    // subscription_id is null when the domain was created from plan-based entitlement.
    if (row.subscription_id && row.subscription_id !== 'plan-email-addon') {
      const addon: any = await c.env.DB.prepare(
        'SELECT * FROM addon_subscriptions WHERE id = ? AND status = \'active\''
      ).bind(row.subscription_id).first();
      if (!addon) {
        return c.json({
          error: 'Linked email add-on subscription is no longer active. Ask customer to renew.',
          code: 'E_ADDON_INACTIVE',
        }, 400);
      }
      // Enforce the add-on's domain quota before consuming a slot.
      if (addon.domains_allowed != null && Number(addon.domains_used) >= Number(addon.domains_allowed)) {
        return c.json({
          error: 'Email add-on domain quota reached for this workspace.',
          code: 'E_ADDON_QUOTA',
          domains_used: addon.domains_used,
          domains_allowed: addon.domains_allowed,
        }, 400);
      }
      await c.env.DB.prepare(
        'UPDATE addon_subscriptions SET domains_used = domains_used + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(row.subscription_id).run();
    }

    await c.env.DB.prepare("UPDATE domains SET review_status = 'approved' WHERE id = ?").bind(id).run();

    // Start Cloudflare onboarding (zone + email routing) asynchronously after approval
    c.executionCtx.waitUntil((async () => {
      try {
        const { onboardDomain } = await import('../services/emailService');
        const updated: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
        if (updated) {
          const result: any = await onboardDomain(c.env, updated);
          console.log(`[Admin] Domain ${updated.domain_name} onboarding done -> status=${result?.status} zone=${result?.zone_id ? 'set' : 'null'} error=${result?.error_message || 'none'}`);
        }
      } catch (e) {
        console.error('[Admin] Domain onboarding failed after approval:', e);
      }
    })());

    return c.json({ success: true, message: 'Domain approved. Cloudflare onboarding started.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

admin.post('/domains/:id/reject', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const { reason } = await c.req.json();
    const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
    if (!row) return c.json({ error: 'Domain not found' }, 404);

    await c.env.DB.prepare("UPDATE domains SET review_status = 'rejected', status = 'failed', error_message = ? WHERE id = ?")
      .bind(reason || 'Rejected by admin', id).run();

    return c.json({ success: true, message: 'Domain rejected.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Restore an abuse-auto-suspended email domain
admin.post('/domains/:id/unsuspend', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const row: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
    if (!row) return c.json({ error: 'Domain not found' }, 404);
    if (row.status !== 'suspended') {
      return c.json({ error: 'Domain is not suspended' }, 400);
    }

    // Back to 'pending': a background re-check (checkDomain) flips the domain
    // to 'active' only when Cloudflare routing is healthy again.
    // abuse_reset_at restarts the 24h failure baseline so the still-hot old
    // failures cannot deterministically re-suspend the domain on its next send.
    await c.env.DB.prepare(
      "UPDATE domains SET status = 'pending', error_message = NULL, last_checked_at = CURRENT_TIMESTAMP, abuse_reset_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run();

    // Clear the abuse verdict cache so the lifted domain is not blocked by a
    // stale 'blocked' entry from the last auto-suspend.
    if (c.env.SECRETS_KV) {
      try {
        await c.env.SECRETS_KV.delete(`email_abuse:${id}`);
      } catch (cacheErr) {
        console.error('[Admin] Failed to clear abuse cache:', cacheErr);
      }
    }

    c.executionCtx.waitUntil((async () => {
      try {
        const { checkDomain } = await import('../services/emailService');
        const updated: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
        if (updated) await checkDomain(c.env, updated);
      } catch (e) {
        console.error('[Admin] Domain re-check failed after unsuspend:', e);
      }
    })());

    return c.json({ success: true, message: 'Domain unsuspended. DNS verification re-check started.' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// ==========================================
// KV NAMESPACE COPY TOOL
// ==========================================

/**
 * Copies keys from one KV namespace to another via the Cloudflare REST API.
 *
 * The copy is cursor-resumable and bounded per request (20 keys max) so it
 * stays inside Worker subrequest/wall-time limits even on big namespaces.
 * Listing uses the same page size as the batch, so `cursor` stays page-aligned
 * and no keys are skipped. The client keeps calling with the returned `cursor`
 * until `done: true`.
 *
 * Live session/OTP keys (`SESSION:` / `OTP:` prefixes) are never copied -
 * they hold per-user auth state and must not leak into another namespace.
 *
 * Body: { sourceNamespaceId, destNamespaceId, cursor? }
 */
admin.post('/kv-copy', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);

  const { sourceNamespaceId, destNamespaceId, cursor } = await c.req.json();
  if (!sourceNamespaceId || !destNamespaceId) {
    return c.json({ error: 'sourceNamespaceId and destNamespaceId are required' }, 400);
  }
  if (sourceNamespaceId === destNamespaceId) {
    return c.json({ error: 'Source and destination namespaces must be different' }, 400);
  }

  try {
    const { listKvKeys, getKvValue, putKvValue, getCloudflareCredentials } = await import('../services/cloudflareApi');
    const creds = await getCloudflareCredentials(c.env);
    if (!creds.token || !creds.accountId) {
      return c.json({ error: 'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing from SECRETS_KV' }, 500);
    }

    // 1. List keys from the source namespace. Page size == batch size so the
    //    cursor returned by Cloudflare always aligns with what was copied.
    const MAX_KEYS_PER_REQUEST = 20;
    const { keys, cursor: nextCursor } = await listKvKeys(
      c.env, sourceNamespaceId, { limit: MAX_KEYS_PER_REQUEST, cursor }, creds
    );

    // 2. Never copy keys the /kv admin route blocks from being written
    //    (ADMIN_CONTACT_EMAIL, live session/OTP entries).
    const blockedKeys = ['ADMIN_CONTACT_EMAIL', 'SESSION:', 'OTP:'];
    const batch = keys.filter((k: any) => !blockedKeys.some((b) => k.name === b || k.name.startsWith(b)));

    let copied = 0;
    let skipped = keys.length - batch.length;
    const failures: string[] = [];

    for (const keyMeta of batch) {
      const key = keyMeta.name;
      try {
        const value = await getKvValue(c.env, sourceNamespaceId, key, creds);
        await putKvValue(c.env, destNamespaceId, key, value, keyMeta.expiration, creds);
        copied++;
      } catch (e: any) {
        console.error(`[Admin] KV copy failed for key ${key}:`, e);
        failures.push(key);
      }
    }

    const done = !nextCursor;

    return c.json({
      success: true,
      done,
      cursor: done ? undefined : nextCursor,
      copied,
      skipped,
      failed: failures.length,
      failures: failures.slice(0, 20),
    });
  } catch (err: any) {
    console.error('[Admin] KV copy error:', err);
    return c.json({ error: err.message }, 500);
  }
});

admin.post('/domains/:id/diagnose', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const id = c.req.param('id');
    const domain: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
    if (!domain) return c.json({ error: 'Domain not found' }, 404);
    if (domain.review_status !== 'approved') {
      return c.json({ success: false, error: 'Domain not approved yet' });
    }

    const result: any = {
      before: {
        status: domain.status,
        zone_id: domain.zone_id,
        routing_rule_id: domain.routing_rule_id,
        error_message: domain.error_message,
      },
      onboarding: null,
    };

    try {
      const { onboardDomain } = await import('../services/emailService');
      const onboardResult = await onboardDomain(c.env, domain);
      result.onboarding = { ok: true, status: onboardResult?.status || 'unknown' };
    } catch (e: any) {
      result.onboarding = { ok: false, error: e.message };
    }

    const fresh: any = await c.env.DB.prepare('SELECT * FROM domains WHERE id = ?').bind(id).first();
    result.after = {
      status: fresh.status,
      zone_id: fresh.zone_id,
      routing_rule_id: fresh.routing_rule_id,
      error_message: fresh.error_message,
    };

    return c.json({ success: true, result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default admin;