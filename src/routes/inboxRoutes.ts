import { Hono } from 'hono';
import { Env } from '../types';
import { pagination } from '../shared';

const router = new Hono<{ Bindings: Env }>();

router.post('/api/inbox/conversations/initiate', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { contactId, phone_number_id } = await c.req.json();
  if (!contactId) return c.json({ error: 'Contact ID required' }, 400);

  const contact = await c.env.DB.prepare('SELECT * FROM contacts WHERE id = ? AND workspace_id = ?')
    .bind(contactId, workspaceId).first<{ platform_contact_id: string }>();
  if (!contact) return c.json({ error: 'संपर्क नहीं मिला' }, 404);

  let finalPhoneNumberId = phone_number_id;
  if (finalPhoneNumberId) {
    // Verify phone_number_id belongs to workspace
    const config = await c.env.DB.prepare('SELECT phone_number_id FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?')
      .bind(workspaceId, finalPhoneNumberId).first<{ phone_number_id: string }>();
    if (!config) return c.json({ error: 'Invalid phone_number_id for this workspace' }, 400);
  } else {
    const config = await c.env.DB.prepare('SELECT phone_number_id FROM whatsapp_configs WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 1')
      .bind(workspaceId).first<{ phone_number_id: string }>();
    if (config) {
      finalPhoneNumberId = config.phone_number_id;
    }
  }

  let conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE workspace_id = ? AND contact_id = ? AND (phone_number_id = ? OR phone_number_id IS NULL)')
    .bind(workspaceId, contactId, finalPhoneNumberId || '').first<{ id: string }>();

  if (!conv) {
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO conversations (id, workspace_id, contact_id, platform, status, phone_number_id) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, workspaceId, contactId, 'whatsapp', 'open', finalPhoneNumberId || null).run();

    const newConv = await c.env.DB.prepare(`
      SELECT c.*, t.name as contact_name, t.platform_contact_id as phone
      FROM conversations c
      JOIN contacts t ON c.contact_id = t.id
      WHERE c.id = ?
    `).bind(id).first();

    return c.json({ success: true, conversation: newConv });
  }

  const existingConv = await c.env.DB.prepare(`
    SELECT c.*, t.name as contact_name, t.platform_contact_id as phone
    FROM conversations c
    JOIN contacts t ON c.contact_id = t.id
    WHERE c.id = ?
  `).bind(conv.id).first();

  return c.json({ success: true, conversation: existingConv });
});

// 3. Real-Time Chat (Durable Objects + SQLite)
router.get('/api/inbox/conversations', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const phoneNumberId = c.req.query('phoneNumberId');
  const platform = c.req.query('platform') || 'all';
  const aiFilter = c.req.query('aiFilter') || 'all';
  const statusFilter = c.req.query('status') || 'all';

  let query = `
    SELECT c.id, c.platform, c.status, c.updated_at, c.customer_last_message_at,
           c.phone_number_id, c.ai_label, c.ai_summary,
           ct.name as contact_name, ct.platform_contact_id as phone, ct.id as contact_id,
           (SELECT content FROM messages m WHERE m.conversation_id = c.id
            ORDER BY m.created_at DESC LIMIT 1) AS last_message
    FROM conversations c
    JOIN contacts ct ON c.contact_id = ct.id
    WHERE c.workspace_id = ?
  `;
  const binds: any[] = [workspaceId];
  if (phoneNumberId && phoneNumberId !== 'all') {
    query += ` AND (c.phone_number_id = ? OR c.phone_number_id IS NULL)`;
    binds.push(phoneNumberId);
  }
  if (platform && platform !== 'all') {
    query += ` AND c.platform = ?`;
    binds.push(platform);
  }
  if (aiFilter && aiFilter !== 'all') {
    query += ` AND c.ai_label = ?`;
    binds.push(aiFilter);
  }
  if (statusFilter && statusFilter !== 'all') {
    query += ` AND c.status = ?`;
    binds.push(statusFilter);
  }
  query += ` ORDER BY c.updated_at DESC`;

  const { limit, offset } = pagination(c, 100);
  query += ` LIMIT ? OFFSET ?`;
  const { results } = await c.env.DB.prepare(query).bind(...binds, limit, offset).all();

  return c.json({ conversations: results || [] });
});

// Get Messages for a Conversation
router.get('/api/inbox/messages/:conversationId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('conversationId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // Validate conversation belongs to workspace
  const conv: any = await c.env.DB.prepare(
    `SELECT c.*, ct.name AS contact_name, ct.platform_contact_id AS phone, ct.email AS contact_email
     FROM conversations c JOIN contacts ct ON c.contact_id = ct.id
     WHERE c.id = ? AND c.workspace_id = ?`
  ).bind(conversationId, workspaceId).first();
  if (!conv) return c.json({ error: 'Forbidden' }, 403);

  const { limit, offset } = pagination(c, 100);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?'
  ).bind(conversationId, limit, offset).all();

  return c.json({ messages: results, conversation: conv });
});

// AI: classify inbox conversations (Gemini) and persist ai_label/ai_summary
router.post('/api/inbox/ai/classify', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { classifyConversations } = await import('../services/inboxAI');
  const result = await classifyConversations(c.env, workspaceId);
  if (result.failed) {
    return c.json({ error: 'AI classification failed. Check GEMINI_API_KEY in KV.' }, 502);
  }
  return c.json({ success: true, classified: result.classified });
});

// AI: suggest a reply draft for a conversation (Gemini)
router.post('/api/inbox/ai/suggest', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { conversationId } = await c.req.json();
  if (!conversationId) return c.json({ error: 'conversationId is required' }, 400);

  const { suggestReply } = await import('../services/inboxAI');
  const result = await suggestReply(c.env, workspaceId, conversationId);
  if (result.failed) {
    return c.json({ error: 'AI suggestion failed. Check GEMINI_API_KEY in KV.' }, 502);
  }
  return c.json({ success: true, suggestion: result.suggestion });
});

// Update conversation status (open/closed)
router.post('/api/inbox/conversations/:conversationId/status', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('conversationId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { status } = await c.req.json();
  if (status !== 'open' && status !== 'closed') {
    return c.json({ error: 'Invalid status. Must be "open" or "closed"' }, 400);
  }

  // Validate conversation belongs to workspace
  const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND workspace_id = ?').bind(conversationId, workspaceId).first();
  if (!conv) return c.json({ error: 'Conversation not found or forbidden' }, 404);

  await c.env.DB.prepare('UPDATE conversations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(status, conversationId).run();

  // Broadcast status change via Durable Object
  try {
    const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const stub = c.env.CHAT_DO.get(globalDoId);
    await stub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversation_status_updated',
        conversation_id: conversationId,
        status
      })
    }));
  } catch (doErr) {
    console.error("Failed to broadcast status update to DO:", doErr);
  }

  return c.json({ success: true, status });
});

// Delete conversation
router.delete('/api/inbox/conversations/:conversationId', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  const conversationId = c.req.param('conversationId');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  // Validate conversation belongs to workspace
  const conv = await c.env.DB.prepare('SELECT id FROM conversations WHERE id = ? AND workspace_id = ?').bind(conversationId, workspaceId).first();
  if (!conv) return c.json({ error: 'Conversation not found or forbidden' }, 404);

  // Delete messages first to maintain database cleanliness
  await c.env.DB.prepare('DELETE FROM messages WHERE conversation_id = ?').bind(conversationId).run();
  await c.env.DB.prepare('DELETE FROM conversations WHERE id = ?').bind(conversationId).run();

  // Broadcast deletion via Durable Object
  try {
    const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
    const stub = c.env.CHAT_DO.get(globalDoId);
    await stub.fetch(new Request('http://do/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'conversation_deleted',
        conversation_id: conversationId
      })
    }));
  } catch (doErr) {
    console.error("Failed to broadcast deletion to DO:", doErr);
  }

  return c.json({ success: true, message: 'Conversation deleted successfully' });
});

// ==========================================
// CALLING FEATURES API ENDPOINTS
// ==========================================

// GET call history

export default router;
