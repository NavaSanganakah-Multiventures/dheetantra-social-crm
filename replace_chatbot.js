const fs = require('fs');

const file = 'src/services/chatbot.ts';
let code = fs.readFileSync(file, 'utf8');

// Add AI import if needed
if (!code.includes('@google/genai')) {
    code = "import { GoogleGenAI } from '@google/genai';\n" + code;
}

const targetStart = '  // Chatbot logic - Supports both standard Cloud API and WhatsApp Business App integrations\n  let replyText = \'\';';
const targetEnd = '  // Send the reply back to the user\n  await sendWhatsAppMessage(env, phoneNumberId, from, replyText, conversationId);';

const targetBlock = code.slice(code.indexOf(targetStart), code.indexOf(targetEnd) + targetEnd.length);

const newBlock = `  // Check Bot Settings
  let replyMode = 'manual';
  try {
    try {
      await env.DB.prepare("ALTER TABLE whatsapp_configs ADD COLUMN reply_mode TEXT DEFAULT 'manual'").run();
    } catch(e) {}
    
    const config = await env.DB.prepare('SELECT reply_mode FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first();
    if (config && config.reply_mode) {
      replyMode = config.reply_mode;
    }
  } catch (e) {
    console.error("Failed to get reply_mode", e);
  }

  if (replyMode === 'manual') {
    return; // Don't auto-reply
  }

  let replyText = '';
  
  if (replyMode === 'ai') {
    try {
       const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
       const aiResponse = await ai.models.generateContent({
           model: 'gemini-3.5-flash',
           contents: \`You are a helpful customer support AI for Dhitantra. 
User message: "\${messageText}" 
User Name: \${contactName}
Respond naturally and helpfully in the same language as the user. Keep it concise for WhatsApp.\`
       });
       replyText = aiResponse.text || "I'm sorry, I couldn't process that request right now.";
    } catch (e) {
       console.error("AI Generation failed", e);
       replyText = "Sorry, our AI system is currently unavailable. We will get back to you shortly.";
    }
  } else {
    // Rule based logic
    if (messageType === 'text') {
      replyText = \`नमस्ते \${contactName}! Dhitantra प्लेटफॉर्म में आपका स्वागत है।\\n\\n\`;
      const text = messageText.toLowerCase().trim();
      if (text === 'hi' || text === 'hello' || text === 'नमस्ते') {
        replyText += 'हम आपकी कैसे मदद कर सकते हैं?\\n\\nनीचे दिए गए विकल्पों में से टाइप करें:\\n1. Services (सेवाएं)\\n2. Support (सहायता)\\n3. Pricing (कीमत)';
      } else if (text.includes('1') || text.includes('services')) {
        replyText = 'हम एक संपूर्ण Social Media Management और CRM टूल प्रदान करते हैं। आप यहाँ से अपने सभी मैसेज और शेड्यूलिंग मैनेज कर सकते हैं।';
      } else if (text.includes('2') || text.includes('support')) {
        replyText = 'कृपया अपना सवाल पूछें, हमारी टीम जल्द ही आपसे संपर्क करेगी।';
      } else if (text.includes('3') || text.includes('pricing')) {
        replyText = 'हमारी कीमत से जुड़ी जानकारी के लिए कृपया हमारी वेबसाइट www.dhitantra.com पर जाएँ।';
      } else {
        replyText = 'मुझे आपका संदेश समझ में नहीं आया। कृपया "Hi" या "Hello" लिखकर दोबारा शुरुआत करें।';
      }
    } else {
      let typeInHindi = 'संदेश';
      if (messageType === 'image') typeInHindi = 'फ़ोटो (Image)';
      else if (messageType === 'video') typeInHindi = 'वीडियो (Video)';
      else if (messageType === 'document') typeInHindi = 'दस्तावेज़ (Document)';
      else if (messageType === 'location') typeInHindi = 'लोकेशन (Location)';
      else if (messageType === 'contacts') typeInHindi = 'कॉन्टैक्ट (Contact)';
      
      replyText = \`नमस्ते \${contactName}! हमें आपका \${typeInHindi} प्राप्त हुआ है। हमारी सहायता टीम जल्द ही आपसे संपर्क करेगी।\`;
    }
  }

  // Send the reply back to the user
  await sendWhatsAppMessage(env, phoneNumberId, from, replyText, conversationId);`;

if(code.indexOf(targetBlock) === -1) {
    console.error("Could not find target block");
} else {
    code = code.replace(targetBlock, newBlock);
    fs.writeFileSync(file, code);
    console.log("Updated chatbot.ts");
}
