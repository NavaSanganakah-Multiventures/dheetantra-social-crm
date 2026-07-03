const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace the URL inputs with file inputs
// We will replace 'mediaUrlInput' with a file picker.

const oldInputBlock = `                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">मीडिया यूआरएल (Direct URL)*</label>
                        <input 
                          type="text" 
                          placeholder={
                            attachmentType === 'image' ? "https://picsum.photos/seed/vibrant/800/600" :
                            attachmentType === 'video' ? "https://www.w3schools.com/html/mov_bbb.mp4" :
                            "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
                          }
                          className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100"
                          value={mediaUrlInput}
                          onChange={(e) => setMediaUrlInput(e.target.value)}
                        />
                      </div>`;

const newInputBlock = `                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-zinc-500 font-medium block mb-1">फ़ाइल चुनें (File)*</label>
                        <input 
                          type="file" 
                          accept={
                            attachmentType === 'image' ? "image/*" :
                            attachmentType === 'video' ? "video/*" :
                            "application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          }
                          className="w-full text-xs p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 outline-none focus:border-indigo-500 text-zinc-800 dark:text-zinc-100 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                          onChange={async (e) => {
                             const file = e.target.files?.[0];
                             if (file) {
                                // Convert to base64 or object URL for preview, and we'll upload it when sending
                                // For now, we will just use a global state or attach it to the form
                                setMediaFileState(file);
                             }
                          }}
                        />
                      </div>`;

if (code.includes(oldInputBlock)) {
    code = code.replace(oldInputBlock, newInputBlock);
}

// Add state for file
const stateInsert = `    const [mediaFileState, setMediaFileState] = useState<File | null>(null);`;
if (!code.includes('const [mediaFileState, setMediaFileState]')) {
    code = code.replace('const [mediaUrlInput, setMediaUrlInput] = useState("");', 'const [mediaUrlInput, setMediaUrlInput] = useState("");\n' + stateInsert);
}

// Modify sendRichMessage to handle File upload
const sendRichMsgTarget = `      const payload = {
        contactId: activeChat.contact_id,
        messageType: attachmentType,
        mediaUrl: mediaUrlInput,`;

const sendRichMsgReplacement = `
      let finalMediaUrl = mediaUrlInput;
      // Handle file upload if a file was selected
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

      const payload = {
        contactId: activeChat.contact_id,
        messageType: attachmentType,
        mediaUrl: finalMediaUrl,`;

if (code.includes(sendRichMsgTarget)) {
    code = code.replace(sendRichMsgTarget, sendRichMsgReplacement);
}

// Also clear the file state when cancelling or after send
code = code.replace(/setAttachmentType\(null\);/g, 'setAttachmentType(null); setMediaFileState(null);');

fs.writeFileSync(file, code);
console.log("Updated file inputs");
