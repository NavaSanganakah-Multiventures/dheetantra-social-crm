const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = '    const [mediaFileState, setMediaFileState] = useState<File | null>(null);';
if (code.includes(target)) {
   code = code.replace(target, target + '\n    const [replyMode, setReplyMode] = useState("manual");');
   fs.writeFileSync(file, code);
} else {
   console.log("Could not find target");
}
