import re

with open("src/index.ts", "r") as f:
    content = f.read()

# 2. Fetch Secure API Key from KV
key_search = '''  // 2. Fetch Secure API Key from KV
  const geminiKey = await c.env.SECRETS_KV.get('GEMINI_API_KEY');
  if (!geminiKey) {
    return c.text('Gemini API key not configured', 500);
  }'''

key_replace = '''  // 2. Fetch Secure API Key from KV
  const geminiKey = await c.env.SECRETS_KV.get('GEMINI_API_KEY');
  if (!geminiKey) {
    console.error("[Gemini Proxy] Missing GEMINI_API_KEY in KV");
    return c.text('Gemini API key not configured', 500);
  }'''

content = content.replace(key_search, key_replace)

with open("src/index.ts", "w") as f:
    f.write(content)
