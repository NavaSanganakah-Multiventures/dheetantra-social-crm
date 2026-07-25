import re

with open("src/index.ts", "r") as f:
    content = f.read()

# 1. Authenticate the request using standard cookie auth
auth_search = '''  // 1. Authenticate the request using standard cookie auth
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  let user = null;
  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) user = JSON.parse(userDataStr);
  }
  if (!user) return c.json({ error: 'Unauthorized' }, 401);'''

auth_replace = '''  // 1. Authenticate the request using standard cookie auth
  // Some WebSocket clients don't send cookies, bypass for dev testing if necessary or extract from URL query params.
  // Assuming it works normally with browser WebSockets which send cookies, we'll log auth failures to debug.
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) {
    console.error("[Gemini Proxy] Missing auth_session cookie");
    // Fallback: Check if we pass it in query or header in real usage. For now, we will return 401 but let's at least log it.
    return c.text('Unauthorized: missing cookie', 401);
  }
  let user = null;
  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) user = JSON.parse(userDataStr);
  }
  if (!user) {
    console.error(`[Gemini Proxy] Invalid session data for ID: ${sessionId}`);
    return c.text('Unauthorized: invalid session', 401);
  }'''

content = content.replace(auth_search, auth_replace)

with open("src/index.ts", "w") as f:
    f.write(content)
