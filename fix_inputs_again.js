const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const target = `    if (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') {
      if (!mediaUrlInput.trim()) {
        alert("कृपया मीडिया यूआरएल प्रदान करें");
        return;
      }
      payload.mediaUrl = mediaUrlInput.trim();`;

const replacement = `    if (attachmentType === 'image' || attachmentType === 'video' || attachmentType === 'document') {
      let finalMediaUrl = mediaUrlInput.trim();
      let finalR2Url = null;
      if (mediaFileState) {
         setSending(true);
         const formData = new FormData();
         formData.append('file', mediaFileState);
         
         try {
            const uploadRes = await fetch('/api/whatsapp/upload', {
               method: 'POST',
               headers: { 'x-workspace-id': localStorage.getItem('workspaceId') || '' },
               body: formData
            });
            const uploadData = await uploadRes.json();
            if (uploadData.success && uploadData.mediaUrl) {
               finalMediaUrl = uploadData.mediaUrl;
               finalR2Url = uploadData.r2Url;
            } else {
               alert('File upload failed: ' + uploadData.error);
               setSending(false);
               return;
            }
         } catch(e) {
            alert('File upload error');
            setSending(false);
            return;
         }
      }
      
      if (!finalMediaUrl) {
        alert("कृपया मीडिया चुनें या यूआरएल प्रदान करें");
        setSending(false);
        return;
      }
      payload.mediaUrl = finalMediaUrl;
      payload.r2Url = finalR2Url;`;

if (code.includes(target)) {
   code = code.replace(target, replacement);
   fs.writeFileSync(file, code);
   console.log("Updated send block properly");
} else {
   console.log("Could not find target block");
}
