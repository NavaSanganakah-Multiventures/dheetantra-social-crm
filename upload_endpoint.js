const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const uploadEndpoint = `
// Upload media to WhatsApp API
app.post('/api/whatsapp/upload', async (c) => {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return c.json({ error: 'Workspace ID required' }, 400);

  try {
    const config = await c.env.DB.prepare('SELECT access_token, phone_number_id FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    if (!config || !config.access_token || !config.phone_number_id) {
      return c.json({ error: 'WhatsApp not configured' }, 400);
    }
    
    const token = config.access_token;
    const phoneNumberId = config.phone_number_id;

    const body = await c.req.parseBody();
    const file = body['file'];
    
    if (!file || typeof file === 'string') {
       return c.json({ error: 'No file uploaded' }, 400);
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', file.type);
    formData.append('messaging_product', 'whatsapp');
    
    const uploadRes = await fetch(\`https://graph.facebook.com/v19.0/\${phoneNumberId}/media\`, {
       method: 'POST',
       headers: {
          'Authorization': \`Bearer \${token}\`
       },
       body: formData
    });
    
    const uploadData = await uploadRes.json();
    if (uploadData.id) {
       return c.json({ success: true, mediaUrl: uploadData.id });
    } else {
       console.error("WA Upload Error", uploadData);
       return c.json({ error: 'WhatsApp API upload failed', details: uploadData }, 400);
    }
  } catch (e) {
    console.error('Media upload error:', e);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
});
`;

if (!code.includes('/api/whatsapp/upload')) {
    code += '\n' + uploadEndpoint;
    fs.writeFileSync(file, code);
    console.log("Added upload endpoint");
}
