const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('import { Download, ')) {
    code = code.replace(/import \{([^}]+)\}/, 'import { Download, $1 }');
}

// Image rendering
const imgRegex = /(<div className="flex flex-col gap-2">[\s\S]*?<img[\s\S]*?\/>\n\s*<\/div>)/g;
code = code.replace(imgRegex, (match) => {
   if(match.includes('<a href={displayMediaUrl} download')) return match;
   return match.replace('</div>', `
                                     <a href={displayMediaUrl} download="image.jpg" target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Download className="w-4 h-4" />
                                     </a>
                                   </div>`);
});
// Need to add group class to the image container
code = code.replace('className="relative rounded-lg overflow-hidden', 'className="group relative rounded-lg overflow-hidden');

// Video rendering
const videoRegex = /(<video[\s\S]*?\/>)/g;
code = code.replace(videoRegex, (match) => {
   if(match.includes('<div className="group relative rounded-lg inline-block">')) return match;
   return `<div className="group relative rounded-lg inline-block w-full max-w-xs">\n${match}\n<a href={displayMediaUrl} download="video.mp4" target="_blank" rel="noopener noreferrer" className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-lg hover:bg-black/70 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity"><Download className="w-4 h-4" /></a>\n</div>`;
});
code = code.replace('className="rounded-lg max-w-xs max-h-60"', 'className="rounded-lg w-full max-h-60"');

// Document is already handled by standard link, but let's change "दस्तावेज़ खोलें ↗" to "डाउनलोड करें"
code = code.replace('दस्तावेज़ खोलें ↗', 'डाउनलोड करें (Download)');

fs.writeFileSync(file, code);
