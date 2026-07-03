const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `            } else if (message.image) {
              messageText = message.image.caption || 'Image Message';
              messageType = 'image';
              mediaUrl = \`https://graph.facebook.com/v19.0/\${message.image.id}\`;
            } else if (message.video) {
              messageText = message.video.caption || 'Video Message';
              messageType = 'video';
              mediaUrl = \`https://graph.facebook.com/v19.0/\${message.video.id}\`;
            } else if (message.document) {
              messageText = message.document.caption || message.document.filename || 'Document Message';
              messageType = 'document';
              mediaUrl = \`https://graph.facebook.com/v19.0/\${message.document.id}\`;`;

const replacement = `            } else if (message.image) {
              messageText = message.image.caption || 'Image Message';
              messageType = 'image';
              mediaUrl = message.image.id;
            } else if (message.video) {
              messageText = message.video.caption || 'Video Message';
              messageType = 'video';
              mediaUrl = message.video.id;
            } else if (message.document) {
              messageText = message.document.caption || message.document.filename || 'Document Message';
              messageType = 'document';
              mediaUrl = message.document.id;`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync(file, code);
   console.log("Updated webhook part 1");
}

const target2 = `            // Trigger Chatbot Logic for both Cloud API & WhatsApp Business App
            c.executionCtx.waitUntil(
              handleIncomingMessage(
                c.env, 
                phoneNumberId, 
                message.from, 
                messageText, 
                contact.profile.name,
                message.id,
                messageType,
                mediaUrl
              )
            );`;

const replacement2 = `            // Download media to R2 if needed
            let finalMediaUrl = mediaUrl;
            if (['image', 'video', 'document'].includes(messageType) && mediaUrl) {
               try {
                  const config = await c.env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first();
                  if (config && config.access_token) {
                     const res = await fetch(\`https://graph.facebook.com/v19.0/\${mediaUrl}\`, {
                        headers: { 'Authorization': \`Bearer \${config.access_token}\` }
                     });
                     const data = await res.json();
                     if (data.url) {
                        const binaryRes = await fetch(data.url, {
                           headers: { 'Authorization': \`Bearer \${config.access_token}\` }
                        });
                        const arrayBuffer = await binaryRes.arrayBuffer();
                        let extension = 'bin';
                        if (messageType === 'image') extension = 'jpg';
                        if (messageType === 'video') extension = 'mp4';
                        if (messageType === 'document') extension = 'pdf';
                        const key = \`\${crypto.randomUUID()}.\${extension}\`;
                        await c.env.MEDIA_BUCKET.put(key, arrayBuffer, {
                           httpMetadata: { contentType: binaryRes.headers.get('Content-Type') || 'application/octet-stream' }
                        });
                        finalMediaUrl = \`/api/public/media/\${key}\`;
                     }
                  }
               } catch(e) {
                  console.error("Failed to download media to R2", e);
                  finalMediaUrl = \`https://graph.facebook.com/v19.0/\${mediaUrl}\`;
               }
            }

            // Trigger Chatbot Logic for both Cloud API & WhatsApp Business App
            c.executionCtx.waitUntil(
              handleIncomingMessage(
                c.env, 
                phoneNumberId, 
                message.from, 
                messageText, 
                contact.profile.name,
                message.id,
                messageType,
                finalMediaUrl
              )
            );`;

if (code.includes(target2)) {
   code = code.replace(target2, replacement2);
   fs.writeFileSync(file, code);
   console.log("Updated webhook part 2");
}
