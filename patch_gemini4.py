import re

with open("app/dashboard/page.tsx", "r") as f:
    content = f.read()

# Instead of immediately sending 'Hello', we just send an empty realtimeInput to trigger the session if necessary
search = '''        // Also send an initial empty clientContent to jumpstart it
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [{ text: "Hello" }],
                    },
                  ],
                  turnComplete: true,
                },
              })
            );
          }
        }, 500);'''

replace = '''        // Also send an initial clientContent to jumpstart it
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: "user",
                      parts: [{ text: "नमस्ते!" }],
                    },
                  ],
                  turnComplete: true,
                },
              })
            );
          }
        }, 500);'''

content = content.replace(search, replace)

with open("app/dashboard/page.tsx", "w") as f:
    f.write(content)
