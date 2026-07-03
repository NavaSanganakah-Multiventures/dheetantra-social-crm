const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf-8');

code = code.replace(/if \(callEvent\.event === 'connect' \|\| callEvent\.event === 'ringing' \|\| callEvent\.event === 'offer'\) \{/g, `if (callEvent.event === 'connect' || callEvent.event === 'ringing' || callEvent.event === 'offer' || callEvent.status === 'ringing' || callEvent.type === 'offer') {`);

fs.writeFileSync('src/index.ts', code);
