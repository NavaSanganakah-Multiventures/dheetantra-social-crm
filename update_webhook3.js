const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf-8');

code = code.replace(/else if \(change\.value\.webrtc\) callEvent = change\.value\.webrtc\[0\];/g, `else if (change.value.webrtc) callEvent = change.value.webrtc[0];
            else if (change.value.messages && change.value.messages[0].type === 'call') callEvent = change.value.messages[0];`);

fs.writeFileSync('src/index.ts', code);
