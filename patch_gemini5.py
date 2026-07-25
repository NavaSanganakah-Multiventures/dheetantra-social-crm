import re

with open("app/dashboard/page.tsx", "r") as f:
    content = f.read()

# Add logic to read from base64 chunks directly in onmessage to play audio properly
search = '''            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++)
              bytes[i] = binaryString.charCodeAt(i);

            if (micAudioContextRef.current) {
              const int16Array = new Int16Array(bytes.buffer);
              const float32Array = new Float32Array(int16Array.length);
              for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] =
                  int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7fff);
              }'''

replace = '''            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++)
              bytes[i] = binaryString.charCodeAt(i);

            if (micAudioContextRef.current) {
              // Convert 16-bit PCM little-endian from Gemini to float32
              const dataView = new DataView(bytes.buffer);
              const numSamples = bytes.length / 2;
              const float32Array = new Float32Array(numSamples);
              for (let i = 0; i < numSamples; i++) {
                const int16 = dataView.getInt16(i * 2, true);
                float32Array[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7fff;
              }'''

content = content.replace(search, replace)

with open("app/dashboard/page.tsx", "w") as f:
    f.write(content)
