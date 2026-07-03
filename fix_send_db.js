const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        crypto.randomUUID(), 
        conversationId, 
        'agent', 
        type, 
        contentToSave || null, 
        mediaUrl || null,`;

const replacement = `    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(
        crypto.randomUUID(), 
        conversationId, 
        'agent', 
        type, 
        contentToSave || null, 
        r2Url || mediaUrl || null,`;

code = code.replace(target, replacement);
fs.writeFileSync(file, code);
console.log("Updated send endpoint database save");
