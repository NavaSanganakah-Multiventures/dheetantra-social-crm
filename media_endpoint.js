const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const mediaEndpoint = `
// Proxy for downloading WhatsApp media
app.get('/api/whatsapp/media', async (c) => {
  const workspaceId = c.req.query('workspaceId');
  const mediaUrl = c.req.query('url');
  
  if (!workspaceId || !mediaUrl) {
    return c.text('Missing parameters', 400);
  }

  try {
    const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE workspace_id = ?').bind(workspaceId).first();
    if (!config || !config.access_token) {
      return c.text('WhatsApp not configured', 400);
    }
    
    const token = config.access_token;
    
    // 1. Get the CDN URL from media ID
    const res = await fetch(mediaUrl, {
      headers: { 'Authorization': \`Bearer \${token}\` }
    });
    const data = await res.json();
    
    if (!data.url) {
      return c.text('Media not found or expired', 404);
    }
    
    // 2. Download the actual binary data from CDN URL
    const binaryRes = await fetch(data.url, {
      headers: { 'Authorization': \`Bearer \${token}\` }
    });
    
    const headers = new Headers();
    headers.set('Content-Type', binaryRes.headers.get('Content-Type') || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000');
    
    return new Response(binaryRes.body, {
      status: 200,
      headers: headers
    });
    
  } catch (e) {
    console.error('Media proxy error:', e);
    return c.text('Internal Server Error', 500);
  }
});
`;

if (!code.includes('/api/whatsapp/media')) {
    code += '\n' + mediaEndpoint;
    fs.writeFileSync(file, code);
    console.log("Added media endpoint");
}
