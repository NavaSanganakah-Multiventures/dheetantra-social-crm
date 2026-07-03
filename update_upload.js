const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const target = `    const uploadData = await uploadRes.json();
    if (uploadData.id) {
       return c.json({ success: true, mediaUrl: uploadData.id });`;

const replacement = `    const uploadData = await uploadRes.json();
    
    // Also upload to R2 to have a permanent public URL for our dashboard
    let r2Url = null;
    try {
      const arrayBuffer = await file.arrayBuffer();
      const extension = file.name ? file.name.split('.').pop() : 'bin';
      const key = \`\${crypto.randomUUID()}.\${extension}\`;
      await c.env.MEDIA_BUCKET.put(key, arrayBuffer, {
        httpMetadata: { contentType: file.type }
      });
      r2Url = \`/api/public/media/\${key}\`;
    } catch(e) {
      console.error("Failed to upload to R2", e);
    }

    if (uploadData.id) {
       return c.json({ success: true, mediaUrl: uploadData.id, r2Url: r2Url });`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync(file, code);
   console.log("Updated upload endpoint");
}
