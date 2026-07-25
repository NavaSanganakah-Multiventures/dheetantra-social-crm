import re

with open("src/index.ts", "r") as f:
    content = f.read()

# Make the WebSocket accept more robust and add error logging
search = '''    server.addEventListener("close", () => geminiWebSocket.close());
    geminiWebSocket.addEventListener("close", () => server.close());'''

replace = '''    server.addEventListener("close", (e) => {
      console.log(`[Gemini Proxy] Client WS closed: code=${e.code}, reason=${e.reason}`);
      geminiWebSocket.close();
    });
    geminiWebSocket.addEventListener("close", (e) => {
      console.log(`[Gemini Proxy] Gemini WS closed: code=${e.code}, reason=${e.reason}`);
      server.close();
    });
    server.addEventListener("error", (e) => {
      console.error(`[Gemini Proxy] Client WS error:`, e);
    });
    geminiWebSocket.addEventListener("error", (e) => {
      console.error(`[Gemini Proxy] Gemini WS error:`, e);
    });'''

content = content.replace(search, replace)

with open("src/index.ts", "w") as f:
    f.write(content)
