const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add Bot import
if (!code.includes('Bot,') && !code.includes('Bot ')) {
    code = code.replace(/import \{([^}]+)\}/, 'import { Bot, $1 }');
}

// Add state to InboxView
const inboxViewStart = 'function InboxView() {';
const inboxState = `    const [replyMode, setReplyMode] = useState("manual");`;

if (code.includes(inboxViewStart) && !code.includes('const [replyMode, setReplyMode] = useState("manual");')) {
    code = code.replace(inboxViewStart, inboxViewStart + '\n' + inboxState);
}

// Fetch config in fetchInbox
const fetchInboxStart = 'const fetchInbox = async () => {';
const fetchInboxBlock = `
      try {
        const confRes = await fetch('/api/whatsapp/config', { headers: { 'x-workspace-id': wId } });
        const confData = await confRes.json();
        if (confData.config && confData.config.reply_mode) {
          setReplyMode(confData.config.reply_mode);
        }
      } catch(e) {}
`;
if (code.includes(fetchInboxStart) && !code.includes("const confRes = await fetch('/api/whatsapp/config'")) {
    code = code.replace(fetchInboxStart, fetchInboxStart + fetchInboxBlock);
}

// Add toggle function
const toggleFunc = `
    const toggleAI = async () => {
      const newMode = replyMode === 'ai' ? 'manual' : 'ai';
      setReplyMode(newMode);
      try {
        const wId = localStorage.getItem('workspaceId');
        if (!wId) return;
        
        // We only want to update the reply_mode, so we first fetch current config, then post
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

const toggleInsertPoint = '    const sendRichMessage = async () => {';
if (code.includes(toggleInsertPoint) && !code.includes('const toggleAI = async () => {')) {
    code = code.replace(toggleInsertPoint, toggleFunc + '\n' + toggleInsertPoint);
}

// Add UI in Chat Header
const chatHeaderTarget = `                <button 
                  onClick={() => setIsContactPanelOpen(!isContactPanelOpen)}
                  className={\`p-2 rounded-lg transition-colors \${isContactPanelOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}\`}
                  title="Contact Details"
                >
                  <User className="w-5 h-5" />
                </button>`;

const chatHeaderReplacement = `                <div className="flex items-center gap-2">
                  <button 
                    onClick={toggleAI}
                    className={\`p-2 rounded-lg transition-colors flex items-center gap-1.5 \${replyMode === 'ai' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}\`}
                    title="Toggle AI Chatbot"
                  >
                    <Bot className="w-4 h-4" />
                    <span className="text-[10px] font-bold uppercase tracking-wider hidden md:inline-block">{replyMode === 'ai' ? 'AI ON' : 'AI OFF'}</span>
                  </button>
                  <button 
                    onClick={() => setIsContactPanelOpen(!isContactPanelOpen)}
                    className={\`p-2 rounded-lg transition-colors \${isContactPanelOpen ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}\`}
                    title="Contact Details"
                  >
                    <User className="w-5 h-5" />
                  </button>
                </div>`;

if (code.includes(chatHeaderTarget) && !code.includes('Toggle AI Chatbot')) {
    code = code.replace(chatHeaderTarget, chatHeaderReplacement);
}

fs.writeFileSync(file, code);
console.log("Updated InboxView toggle");
