const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const postStart = "app.post('/api/whatsapp/config', async (c) => {";
const postEnd = "return c.json({ success: true, message: 'WhatsApp config saved' });\n  } catch (err: any) {\n    return c.json({ error: err.message }, 500);\n  }\n});";
const postBlock = code.slice(code.indexOf(postStart), code.indexOf(postEnd) + postEnd.length);

const newPostBlock = `app.post('/api/whatsapp/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  const { phone_number_id, access_token, verify_token, reply_mode } = await c.req.json();
  const id = crypto.randomUUID();

  try {
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN reply_mode TEXT DEFAULT 'manual'").run();
    } catch(e) {}

    const existing: any = await c.env.DB.prepare('SELECT id, access_token, reply_mode FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    const finalToken = access_token || existing?.access_token || '';
    const finalReplyMode = reply_mode || existing?.reply_mode || 'manual';

    if (existing) {
      await c.env.DB.prepare(
        \`UPDATE whatsapp_configs SET phone_number_id = ?, access_token = ?, verify_token = ?, reply_mode = ? WHERE workspace_id = ?\`
      ).bind(phone_number_id, finalToken, verify_token, finalReplyMode, workspaceId).run();
    } else {
      await c.env.DB.prepare(
        \`INSERT INTO whatsapp_configs (id, workspace_id, phone_number_id, access_token, verify_token, reply_mode) 
         VALUES (?, ?, ?, ?, ?, ?)\`
      ).bind(id, workspaceId, phone_number_id, finalToken, verify_token, finalReplyMode).run();
    }
    return c.json({ success: true, message: 'WhatsApp config saved' });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});`;

if(code.indexOf(postBlock) > -1) {
    code = code.replace(postBlock, newPostBlock);
} else {
    console.error("Could not find postBlock");
}

const getStart = "app.get('/api/whatsapp/config', async (c) => {";
const getEnd = "return c.json({ config: config || null });\n  } catch (err: any) {\n    return c.json({ error: err.message }, 500);\n  }\n});";
const getBlock = code.slice(code.indexOf(getStart), code.indexOf(getEnd) + getEnd.length);

const newGetBlock = `app.get('/api/whatsapp/config', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    try {
      await c.env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN reply_mode TEXT DEFAULT 'manual'").run();
    } catch(e) {}
    const config = await c.env.DB.prepare('SELECT phone_number_id, verify_token, reply_mode FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    return c.json({ config: config || null });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});`;

if(code.indexOf(getBlock) > -1) {
    code = code.replace(getBlock, newGetBlock);
} else {
    console.error("Could not find getBlock");
}

fs.writeFileSync(file, code);
console.log("Updated config routes");
