import re

with open("app/dashboard/page.tsx", "r") as f:
    content = f.read()

# Fix the setup format for gemini BidiGenerateContent
# It actually requires clientContent for setup, formatted slightly differently
search = '''        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-exp",
            systemInstruction: { parts: [{ text: aiVoiceInstructions || "You are a helpful AI assistant. Speak politely in Hindi." }] },
            generationConfig: { responseModalities: ["AUDIO"] }
          }
        }));'''

replace = '''        // 1. Send Setup message with instructions
        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.0-flash-exp",
            systemInstruction: { parts: [{ text: aiVoiceInstructions || "You are a helpful AI assistant. Speak politely in Hindi." }] },
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Aoede" // Or 'Puck', 'Charon', 'Kore', 'Fenrir'
                  }
                }
              }
            }
          }
        }));

        // Also send an initial empty clientContent to jumpstart it
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: "user",
                    parts: [{ text: "Hello" }]
                  }
                ],
                turnComplete: true
              }
            }));
          }
        }, 500);'''

content = content.replace(search, replace)

with open("app/dashboard/page.tsx", "w") as f:
    f.write(content)
