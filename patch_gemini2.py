import re

with open("app/dashboard/page.tsx", "r") as f:
    content = f.read()

# Enhance error logging for ws.onerror and ws.onclose
search = '''      ws.onerror = () => {
          setMicTestStatus("WebSocket Error.");
          stopMicTest();
      };

      ws.onclose = () => {
          setMicTestStatus("Disconnected.");
          stopMicTest();
      };'''

replace = '''      ws.onerror = (e) => {
          console.error("Gemini WebSocket Error:", e);
          setMicTestStatus("WebSocket Error.");
          stopMicTest();
      };

      ws.onclose = (e) => {
          console.log("Gemini WebSocket Closed:", e.code, e.reason);
          setMicTestStatus("Disconnected.");
          stopMicTest();
      };'''

content = content.replace(search, replace)

with open("app/dashboard/page.tsx", "w") as f:
    f.write(content)
