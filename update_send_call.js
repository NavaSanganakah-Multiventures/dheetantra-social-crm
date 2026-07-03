const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `            const uploadData = await uploadRes.json();
            if (uploadData.success && uploadData.mediaUrl) {
               finalMediaUrl = uploadData.mediaUrl;
            } else {`;

const replacement = `            const uploadData = await uploadRes.json();
            let finalR2Url = null;
            if (uploadData.success && uploadData.mediaUrl) {
               finalMediaUrl = uploadData.mediaUrl;
               finalR2Url = uploadData.r2Url;
            } else {`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   console.log("Updated send block part 1");
}

const target2 = `      const payload = {
        contactId: activeChat.contact_id,
        messageType: attachmentType,
        mediaUrl: finalMediaUrl,
        text: captionInput
      };`;

const replacement2 = `      const payload = {
        contactId: activeChat.contact_id,
        messageType: attachmentType,
        mediaUrl: finalMediaUrl,
        r2Url: typeof finalR2Url !== 'undefined' ? finalR2Url : null,
        text: captionInput
      };`;

if (code.includes(target2)) {
   code = code.replace(target2, replacement2);
   console.log("Updated send block part 2");
}

fs.writeFileSync(file, code);
