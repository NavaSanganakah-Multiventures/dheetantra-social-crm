const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const getMediaUrlStart = '                    messages.map(msg => {';
const getMediaUrlInsert = `                      let displayMediaUrl = msg.media_url;
                      if (displayMediaUrl && displayMediaUrl.includes('graph.facebook.com')) {
                          const wId = localStorage.getItem('workspaceId');
                          displayMediaUrl = \`/api/whatsapp/media?workspaceId=\${wId}&url=\${encodeURIComponent(displayMediaUrl)}\`;
                      }
`;

if (code.includes(getMediaUrlStart) && !code.includes('displayMediaUrl =')) {
    code = code.replace(getMediaUrlStart, getMediaUrlStart + '\n' + getMediaUrlInsert);
    // Now replace msg.media_url with displayMediaUrl inside the mapping loop, but ONLY in the src or href attributes
    // Actually, replacing msg.media_url with displayMediaUrl globally within the InboxView would be easiest.
}

code = code.replace(/src={msg\.media_url}/g, 'src={displayMediaUrl}');
code = code.replace(/href={msg\.media_url}/g, 'href={displayMediaUrl}');
code = code.replace(/{msg\.media_url && \(/g, '{displayMediaUrl && (');

fs.writeFileSync(file, code);
console.log("Updated media urls");
