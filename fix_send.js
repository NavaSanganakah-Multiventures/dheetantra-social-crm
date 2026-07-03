const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `  const { to, text, conversationId, type = 'text', mediaUrl, filename, location, contacts } = await c.req.json();`;
const replacement = `  const { to, text, conversationId, type = 'text', mediaUrl, r2Url, filename, location, contacts } = await c.req.json();`;

code = code.replace(target, replacement);

const target2 = `          await c.env.DB.prepare(\`
            INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id)
            VALUES (?, ?, 'agent', ?, ?, ?, ?)
          \`).bind(sentMessageId, conversationId, type, text, mediaUrl || null, platformMsgId).run();`;

const replacement2 = `          await c.env.DB.prepare(\`
            INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id)
            VALUES (?, ?, 'agent', ?, ?, ?, ?)
          \`).bind(sentMessageId, conversationId, type, text, r2Url || mediaUrl || null, platformMsgId).run();`;

if (code.includes(target2)) {
    code = code.replace(target2, replacement2);
    console.log("Updated send endpoint database save");
} else {
    console.log("Could not find target2");
}

fs.writeFileSync(file, code);
