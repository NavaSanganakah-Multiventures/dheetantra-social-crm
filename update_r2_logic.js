const fs = require('fs');
const file = 'src/index.ts';
let code = fs.readFileSync(file, 'utf8');

const r2Endpoint = `
// Serve R2 media publicly
app.get('/api/public/media/:key', async (c) => {
  const key = c.req.param('key');
  try {
    const object = await c.env.MEDIA_BUCKET.get(key);
    if (!object) {
      return c.text('Not found', 404);
    }
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    
    return new Response(object.body, {
      headers
    });
  } catch(e) {
    console.error("R2 get error", e);
    return c.text('Internal Server Error', 500);
  }
});
`;

if (!code.includes('/api/public/media/:key')) {
   code += '\n' + r2Endpoint;
   fs.writeFileSync(file, code);
   console.log("Added R2 public endpoint");
}
