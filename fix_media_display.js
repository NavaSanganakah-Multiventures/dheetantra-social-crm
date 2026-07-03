const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(
    "if (displayMediaUrl && displayMediaUrl.includes('graph.facebook.com')) {",
    "if (displayMediaUrl && (!displayMediaUrl.startsWith('http') || displayMediaUrl.includes('graph.facebook.com'))) {"
);

fs.writeFileSync(file, code);
