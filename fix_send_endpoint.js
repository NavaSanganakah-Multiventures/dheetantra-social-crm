const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const targetBlock = `    if (type === 'text') {
      if (!text) return c.json({ error: 'Text content is required for text messages' }, 400);
      payload.text = { preview_url: false, body: text };
    } else if (type === 'image') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for image messages' }, 400);
      payload.image = { link: mediaUrl, caption: text || "" };
    } else if (type === 'video') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for video messages' }, 400);
      payload.video = { link: mediaUrl, caption: text || "" };
    } else if (type === 'document') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for document messages' }, 400);
      payload.document = { link: mediaUrl, filename: filename || 'Document.pdf', caption: text || "" };
    }`;

const replaceBlock = `
    const isMediaId = mediaUrl && !mediaUrl.startsWith('http');
    const mediaObj = isMediaId ? { id: mediaUrl } : { link: mediaUrl };

    if (type === 'text') {
      if (!text) return c.json({ error: 'Text content is required for text messages' }, 400);
      payload.text = { preview_url: false, body: text };
    } else if (type === 'image') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for image messages' }, 400);
      payload.image = { ...mediaObj, caption: text || "" };
    } else if (type === 'video') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for video messages' }, 400);
      payload.video = { ...mediaObj, caption: text || "" };
    } else if (type === 'document') {
      if (!mediaUrl) return c.json({ error: 'Media URL is required for document messages' }, 400);
      payload.document = { ...mediaObj, filename: filename || 'Document.pdf', caption: text || "" };
    }`;

if (code.includes(targetBlock)) {
    code = code.replace(targetBlock, replaceBlock);
    fs.writeFileSync(file, code);
    console.log("Updated send endpoint");
} else {
    console.error("Target block not found in send endpoint");
}
