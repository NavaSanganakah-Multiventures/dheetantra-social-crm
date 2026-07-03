const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf-8');

code = code.replace(/if \(change\.field === 'webrtc' && change\.value && change\.value\.calls\) \{[\s\S]*?const callEvent = change\.value\.calls\[0\];/g, `if (change.value && (change.field === 'calls' || change.field === 'webrtc')) {
            let callEvent = null;
            if (change.value.calls) callEvent = change.value.calls[0];
            else if (change.value.webrtc) callEvent = change.value.webrtc[0];
            else callEvent = change.value; // fallback
            
            if (!callEvent || !callEvent.id) continue;
`);

fs.writeFileSync('src/index.ts', code);
