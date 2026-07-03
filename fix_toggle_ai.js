const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

const toggleFunc = `
  const toggleAI = async () => {
    const newMode = replyMode === 'ai' ? 'manual' : 'ai';
    setReplyMode(newMode);
    try {
      const wId = localStorage.getItem('workspaceId');
      if (!wId) return;
      
      const confRes = await fetch('/api/whatsapp/config', { headers: { 'x-workspace-id': wId } });
      const confData = await confRes.json();
      const existing = confData.config || {};
      
      await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-workspace-id': wId },
        body: JSON.stringify({ 
          phone_number_id: existing.phone_number_id || "", 
          verify_token: existing.verify_token || "", 
          reply_mode: newMode 
        })
      });
    } catch (e) {
      console.error("Failed to toggle AI", e);
    }
  };
`;

code = code.replace('  const sendRichMessage = async () => {', toggleFunc + '\n  const sendRichMessage = async () => {');
fs.writeFileSync(file, code);
