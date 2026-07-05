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
    
    // Automatic admin access for user email
    let isAdmin = email === 'navasanganakah@gmail.com';

    // Fallback: Check for configured admins list in KV
    const adminEmailsConfig = await c.env.SECRETS_KV.get('ADMIN_EMAILS');
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
import { diffSchema, allTableNames } from '../schema';

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
    const reset = c.req.query('reset') === 'true';

    // Disable foreign keys temporarily
    try { await c.env.DB.prepare('PRAGMA foreign_keys = OFF').run(); } catch (e) { }

    const applied: string[] = [];

    if (reset) {
      // DROP tables in safe order
      const dropBatch = allTableNames.map(name => c.env.DB.prepare(`DROP TABLE IF EXISTS ${name}`));
      await c.env.DB.batch(dropBatch);
      
      // CREATE all tables from schema
      const statements = schemaSqlContent.split(';').map(s => s.trim()).filter(s => s.length > 0);
      const schemaBatch = statements.map(stmt => c.env.DB.prepare(stmt));
      await c.env.DB.batch(schemaBatch);
      applied.push(`Reset database and created ${statements.length} tables`);
    } else {
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
    }

    // Re-enable foreign keys
    try { await c.env.DB.prepare('PRAGMA foreign_keys = ON').run(); } catch (e) { }

    return c.json({ 
      success: true, 
      applied,
      message: reset ? 'Database completely reset and migrated successfully!' : `Migrated successfully! Applied ${applied.length} changes.` 
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

    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO workspaces (id, name, plan_id) VALUES (?, ?, ?)')
      .bind(id, name, plan_id || null)
      .run();

    if (owner_id) {
       await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
         .bind(id, owner_id, 'owner')
         .run();
    }

    return c.json({ success: true, workspace: { id, name, plan_id } });
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

// GET plans list
admin.get('/plans', async (c) => {
  const isAdmin = await verifyAdmin(c);
  if (!isAdmin) return c.json({ error: 'Unauthorized' }, 403);
  if (!c.env.DB) return c.json({ error: 'Database not connected' }, 500);

  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM plans ORDER BY upfront_price ASC').all();
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
    const { id, name, description, upfront_price, pay_as_you_go_rate, features_json } = await c.req.json();
    if (!id || !name) return c.json({ error: 'ID and Name are required' }, 400);

    await c.env.DB.prepare('INSERT INTO plans (id, name, description, upfront_price, pay_as_you_go_rate, features_json) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, name, description || '', parseFloat(upfront_price) || 0, parseFloat(pay_as_you_go_rate) || 0, features_json || '[]')
      .run();

    return c.json({ success: true });
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
    const { name, description, upfront_price, pay_as_you_go_rate, features_json } = await c.req.json();
    if (!name) return c.json({ error: 'Name is required' }, 400);

    await c.env.DB.prepare('UPDATE plans SET name = ?, description = ?, upfront_price = ?, pay_as_you_go_rate = ?, features_json = ? WHERE id = ?')
      .bind(name, description || '', parseFloat(upfront_price) || 0, parseFloat(pay_as_you_go_rate) || 0, features_json || '[]', id)
      .run();

    return c.json({ success: true });
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
      
      // Mask session tokens/OTPs for cleaner security dashboard, showing just size/placeholder
      if (keyName.startsWith('SESSION:')) {
        val = '[Active User Session Data]';
      } else if (keyName.startsWith('OTP:')) {
        val = '[Verification Code Data]';
      } else {
        val = await c.env.SECRETS_KV.get(keyName) || '';
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

export default admin;
