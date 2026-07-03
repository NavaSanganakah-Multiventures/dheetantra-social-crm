const fs = require('fs');
const file = 'app/dashboard/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// Add replyMode state
const stateStart = '    const [metaConfigId, setMetaConfigId] = useState("");';
if (code.includes(stateStart) && !code.includes('const [replyMode, setReplyMode]')) {
    code = code.replace(stateStart, stateStart + '\n    const [replyMode, setReplyMode] = useState("manual");');
}

// Set replyMode in GET
const getStart = '          setVerifyToken(data.config.verify_token || "");\n          setAccessToken("••••••••••••••••"); // Don\'t show actual token';
if (code.includes(getStart) && !code.includes('setReplyMode(data.config.reply_mode')) {
    code = code.replace(getStart, getStart + '\n          setReplyMode(data.config.reply_mode || "manual");');
}

// Include in POST payload
const payloadStart = '        const payload: any = { phone_number_id: phoneNumberId, verify_token: verifyToken };';
if (code.includes(payloadStart) && !code.includes('reply_mode: replyMode')) {
    code = code.replace(payloadStart, '        const payload: any = { phone_number_id: phoneNumberId, verify_token: verifyToken, reply_mode: replyMode };');
}

// Add UI
const uiTarget = `                         <div className="pt-2">
                           <button onClick={saveConfig}`;

const uiReplacement = `                         <div className="mt-6 pt-6 border-t border-zinc-100 dark:border-zinc-800">
                           <h4 className="block text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wider mb-4 flex items-center gap-2">
                             <Bot className="w-4 h-4 text-indigo-500" /> चैटबॉट (Chatbot) और AI सेटिंग्स
                           </h4>
                           <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">ऑटो-रिप्लाई मोड</label>
                           <div className="flex flex-col md:flex-row gap-3 mb-6">
                             <label className={\`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all \${replyMode === 'manual' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}\`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="manual" checked={replyMode === 'manual'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={\`w-4 h-4 rounded-full border flex items-center justify-center \${replyMode === 'manual' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}\`}>
                                   {replyMode === 'manual' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">मैन्युअल (Manual)</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">ऑटो-रिप्लाई बंद रखें। मैं खुद जवाब दूंगा।</p>
                             </label>
                             <label className={\`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all \${replyMode === 'ai' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}\`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="ai" checked={replyMode === 'ai'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={\`w-4 h-4 rounded-full border flex items-center justify-center \${replyMode === 'ai' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}\`}>
                                   {replyMode === 'ai' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">AI चैटबॉट</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">कृत्रिम बुद्धिमत्ता (AI) द्वारा स्मार्ट जवाब।</p>
                             </label>
                             <label className={\`flex-1 flex flex-col p-4 border rounded-xl cursor-pointer transition-all \${replyMode === 'rule_based' ? 'bg-indigo-50 border-indigo-200 dark:bg-indigo-500/10 dark:border-indigo-500/30 ring-1 ring-indigo-500' : 'bg-white border-zinc-200 dark:bg-zinc-950 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'}\`}>
                               <div className="flex items-center gap-2 mb-1">
                                 <input type="radio" name="replyMode" value="rule_based" checked={replyMode === 'rule_based'} onChange={(e) => setReplyMode(e.target.value)} className="hidden" />
                                 <span className={\`w-4 h-4 rounded-full border flex items-center justify-center \${replyMode === 'rule_based' ? 'border-indigo-600 bg-indigo-600' : 'border-zinc-300'}\`}>
                                   {replyMode === 'rule_based' && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                 </span>
                                 <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">रूल्स (Rule-based)</span>
                               </div>
                               <p className="text-xs text-zinc-500 pl-6">पहले से सेट किए गए कीवर्ड्स के आधार पर।</p>
                             </label>
                           </div>
                         </div>
                         <div className="pt-2">
                           <button onClick={saveConfig}`;

if (code.includes(uiTarget) && !code.includes('चैटबॉट (Chatbot)')) {
    code = code.replace(uiTarget, uiReplacement);
}

fs.writeFileSync(file, code);
console.log("Updated SettingsView");
