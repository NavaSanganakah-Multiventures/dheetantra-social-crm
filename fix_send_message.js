const fs = require('fs');
const file = 'src/services/chatbot.ts';
let code = fs.readFileSync(file, 'utf8');

const targetBlock = `  if (messageType === 'text') {
    payload.text = { body: message };
  } else if (messageType === 'image') {
    payload.image = { link: mediaUrl, caption: message || "" };
  } else if (messageType === 'video') {
    payload.video = { link: mediaUrl, caption: message || "" };
  } else if (messageType === 'document') {
    payload.document = { link: mediaUrl, filename: filename || 'Document.pdf', caption: message || "" };
  }`;

const replaceBlock = `  const isMediaId = mediaUrl && !mediaUrl.startsWith('http');
  const mediaObj = isMediaId ? { id: mediaUrl } : { link: mediaUrl };

  if (messageType === 'text') {
    payload.text = { body: message };
  } else if (messageType === 'image') {
    payload.image = { ...mediaObj, caption: message || "" };
  } else if (messageType === 'video') {
    payload.video = { ...mediaObj, caption: message || "" };
  } else if (messageType === 'document') {
    payload.document = { ...mediaObj, filename: filename || 'Document.pdf', caption: message || "" };
  }`;

if (code.includes(targetBlock)) {
    code = code.replace(targetBlock, replaceBlock);
    fs.writeFileSync(file, code);
    console.log("Updated sendWhatsAppMessage logic");
} else {
    console.error("Target block not found");
}
