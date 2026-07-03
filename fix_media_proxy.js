const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
    "const res = await fetch(mediaUrl, {\n      headers: { 'Authorization': `Bearer ${token}` }\n    });",
    "const graphUrl = mediaUrl.startsWith('http') ? mediaUrl : `https://graph.facebook.com/v19.0/${mediaUrl}`;\n    const res = await fetch(graphUrl, {\n      headers: { 'Authorization': `Bearer ${token}` }\n    });"
);

fs.writeFileSync(file, code);
