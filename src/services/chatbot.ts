import { GoogleGenAI } from '@google/genai';
import { Env } from '../types';

export async function handleIncomingMessage(
  env: Env,
  phoneNumberId: string,
  from: string,
  messageText: string,
  contactName: string,
  messageId?: string,
  messageType: string = 'text',
  mediaUrl?: string | null
) {
  console.log(`[handleIncomingMessage] Start. phone_number_id=${phoneNumberId}, from=${from}, messageId=${messageId}, type=${messageType}`);
  // Find the workspace ID for this phone number
  let workspaceId: string | null = null;
  try {
    const config = await env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
    if (config) {
      workspaceId = config.workspace_id;
      console.log(`[handleIncomingMessage] Found workspaceId=${workspaceId}`);
    } else {
      console.error(`[handleIncomingMessage] No workspace found for phone_number_id=${phoneNumberId}`);
    }
  } catch (error) {
    console.error('[handleIncomingMessage] Error fetching whatsapp_config:', error);
  }

  let conversationId: string | null = null;

  // Let's implement saving
  if (workspaceId) {
    try {
      // 1. Upsert contact
      let finalContactId = '';
      const existingContact = await env.DB.prepare(`
        SELECT id FROM contacts WHERE workspace_id = ? AND platform = 'whatsapp' AND platform_contact_id = ?
      `).bind(workspaceId, from).first<{ id: string }>();

      if (existingContact) {
        finalContactId = existingContact.id;
        await env.DB.prepare(`UPDATE contacts SET name = ? WHERE id = ?`).bind(contactName, finalContactId).run();
      } else {
        finalContactId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name)
          VALUES (?, ?, 'whatsapp', ?, ?)
        `).bind(finalContactId, workspaceId, from, contactName).run();
      }
      console.log(`[handleIncomingMessage] Contact sorted. id=${finalContactId}`);

      // 2. Find or create conversation
      let existingConv = await env.DB.prepare(`
        SELECT id FROM conversations WHERE contact_id = ? AND platform = 'whatsapp' AND phone_number_id = ? ORDER BY created_at DESC LIMIT 1
      `).bind(finalContactId, phoneNumberId).first<{ id: string }>();

      if (!existingConv) {
        // Fallback for older conversations without phone_number_id set
        existingConv = await env.DB.prepare(`
          SELECT id FROM conversations WHERE contact_id = ? AND platform = 'whatsapp' AND phone_number_id IS NULL ORDER BY created_at DESC LIMIT 1
        `).bind(finalContactId).first<{ id: string }>();
      }

      if (existingConv) {
        conversationId = existingConv.id;
        await env.DB.prepare(`UPDATE conversations SET updated_at = CURRENT_TIMESTAMP, customer_last_message_at = CURRENT_TIMESTAMP, status = 'open', phone_number_id = ? WHERE id = ?`).bind(phoneNumberId, conversationId).run();
      } else {
        conversationId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO conversations (id, workspace_id, contact_id, platform, status, phone_number_id, customer_last_message_at)
          VALUES (?, ?, ?, 'whatsapp', 'open', ?, CURRENT_TIMESTAMP)
        `).bind(conversationId, workspaceId, finalContactId, phoneNumberId).run();
      }
      console.log(`[handleIncomingMessage] Conversation sorted. id=${conversationId}`);

      // 3. Save incoming message
      if (messageId) {
        const incomingMessageId = crypto.randomUUID();

        // The DB save and the realtime broadcast are independent: a transient
        // DB failure must NOT silently kill the WebSocket broadcast (otherwise
        // the app never sees the message in realtime and only a manual refresh
        // would pick it up).
        try {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id, platform)
            VALUES (?, ?, 'contact', ?, ?, ?, ?, 'whatsapp')
          `).bind(incomingMessageId, conversationId, messageType, messageText, mediaUrl || null, messageId).run();
          console.log(`[handleIncomingMessage] Incoming message saved. id=${incomingMessageId}`);
        } catch (saveErr) {
          console.error('[handleIncomingMessage] Failed to save message — broadcasting anyway:', saveErr);
        }

        // Check if calling is enabled for this phone number/config
        let callingEnabled = 1;
        try {
          const cfg = await env.DB.prepare("SELECT calling_enabled FROM whatsapp_configs WHERE phone_number_id = ?").bind(phoneNumberId).first<{ calling_enabled: number }>();
          if (cfg && cfg.calling_enabled !== undefined) {
            callingEnabled = cfg.calling_enabled;
          }
        } catch(e) {}

        if (messageType === 'system_call' && callingEnabled === 1) {
          try {
            // Dedup: check if a call was already created by the calls field webhook within last 60s
            const existingCall = await env.DB.prepare(
              "SELECT id FROM calls WHERE caller_number = ? AND workspace_id = ? AND status = 'ringing' AND created_at > datetime('now', '-60 seconds') ORDER BY created_at DESC LIMIT 1"
            ).bind(from, workspaceId).first<{ id: string }>();

            if (!existingCall) {
              const callId = crypto.randomUUID();
              const callCreatedAt = new Date().toISOString();
              await env.DB.prepare(`
                INSERT INTO calls (id, workspace_id, contact_id, phone_number_id, caller_number, type, direction, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'voice', 'incoming', 'ringing', ?)
              `).bind(callId, workspaceId, finalContactId, phoneNumberId, from, callCreatedAt).run();

              const callPayload = {
                type: 'incoming_call',
                call: {
                  id: callId,
                  workspace_id: workspaceId,
                  contact_id: finalContactId,
                  contact_name: contactName,
                  phone: from,
                  phoneNumberId: phoneNumberId,
                  type: 'voice',
                  direction: 'incoming',
                  status: 'ringing',
                  created_at: callCreatedAt
                }
              };

              // Broadcast to global DO for real-time overlay
              try {
                const globalDoId = env.CHAT_DO.idFromName(`global-${workspaceId}`);
                const globalStub = env.CHAT_DO.get(globalDoId);
                await globalStub.fetch(new Request('http://do/broadcast', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(callPayload)
                }));
              } catch (e) {
                console.error("Global DO broadcast error:", e);
              }
            } else {
              console.log(`[handleIncomingMessage] Call already exists for ${from}, skipping system_call duplicate: ${existingCall.id}`);
            }
          } catch(err) {
            console.error("Error creating/broadcasting call log:", err);
          }
        }

        // Broadcast incoming message via global Durable Object
        try {
          const globalDoId = env.CHAT_DO.idFromName(`global-${workspaceId}`);
          const stub = env.CHAT_DO.get(globalDoId);
          const broadcastNow = new Date().toISOString();
          await stub.fetch(new Request('http://do/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'new_message',
              customer_last_message_at: broadcastNow,
              from: from,
              contact_name: contactName,
              message: {
                id: incomingMessageId,
                conversation_id: conversationId,
                sender_type: 'contact',
                message_type: messageType,
                content: messageText || null,
                media_url: mediaUrl || null,
                platform_message_id: messageId,
                platform: 'whatsapp',
                created_at: broadcastNow
              }
            })
          }));
        } catch (doErr) {
          console.error("Failed to broadcast incoming message to DO:", doErr);
        }
      }

    } catch (error) {
      console.error('[handleIncomingMessage] Error saving incoming message:', error);
    }
  }

  // Skip auto-reply for system_call messages (voice calls)
  if (messageType === 'system_call') {
    return;
  }

  // Check Bot Settings
  let replyMode = 'manual';
  let aiProvider = 'gemini';
  let aiVoiceInstructions = '';
  try {

    
    const config = await env.DB.prepare('SELECT reply_mode, ai_provider, ai_voice_instructions FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ reply_mode: string, ai_provider: string, ai_voice_instructions: string }>();
    if (config) {
      replyMode = config.reply_mode || 'manual';
      aiProvider = config.ai_provider || 'gemini';
      aiVoiceInstructions = config.ai_voice_instructions || '';
    }
  } catch (e) {
    console.error("Failed to get reply_mode", e);
  }

  // Voice AI Agent Handling (System Calls)
  if (messageType === 'system_call') {
    console.log(`[Calling] system_call received via message webhook. Instructions: ${aiVoiceInstructions}`);
    // Note: The WebRTC SDP doesn't come through the messages webhook,
    // it comes through the calls webhook. So we intercept it there (src/index.ts).
    // This block catches the text representation of the call.
    return; // Stop execution as system_calls don't get text replies
  }

  if (replyMode === 'manual') {
    return; // Don't auto-reply
  }

  let replyText = '';
  
  if (replyMode === 'ai') {
    if (aiProvider === 'workers_ai') {
      try {
        const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
          messages: [
            { role: 'system', content: `You are a helpful customer support AI for Dhitantra. Respond naturally and helpfully in the same language as the user. Keep it concise for WhatsApp. User Name is ${contactName}.` },
            { role: 'user', content: messageText }
          ]
        });
        replyText = response.response || "I'm sorry, I couldn't process that request right now.";
      } catch (e) {
        console.error("Workers AI Generation failed", e);
        replyText = "Sorry, our AI system (Workers AI) is currently unavailable. We will get back to you shortly.";
      }
    } else {
      // Default to Gemini
      const geminiKey = await env.SECRETS_KV.get('GEMINI_API_KEY');
      if (!geminiKey) {
        replyText = "Sorry, our AI service is temporarily unavailable. Our team will assist you shortly.";
      } else {
        try {
          const ai = new GoogleGenAI({ apiKey: geminiKey });
          const aiResponse = await ai.models.generateContent({
              model: 'gemini-2.0-flash',
              contents: `You are a helpful customer support AI for Dhitantra.
  User message: "${messageText}"
  User Name: ${contactName}
  Respond naturally and helpfully in the same language as the user. Keep it concise for WhatsApp.`
          });
          replyText = aiResponse.text || "I'm sorry, I couldn't process that request right now.";
        } catch (e) {
          console.error("AI Generation failed", e);
         replyText = "Sorry, our AI system is currently unavailable. We will get back to you shortly.";
        }
      }
    }
  } else {
    // Rule based logic
    if (messageType === 'text') {
      replyText = `नमस्ते ${contactName}! Dhitantra प्लेटफॉर्म में आपका स्वागत है।\n\n`;
      const text = messageText.toLowerCase().trim();
      if (text === 'hi' || text === 'hello' || text === 'नमस्ते') {
        replyText += 'हम आपकी कैसे मदद कर सकते हैं?\n\nनीचे दिए गए विकल्पों में से टाइप करें:\n1. Services (सेवाएं)\n2. Support (सहायता)\n3. Pricing (कीमत)';
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
      else if (messageType === 'audio') typeInHindi = 'ऑडियो (Audio)';
      else if (messageType === 'sticker') typeInHindi = 'स्टिकर (Sticker)';
      else if (messageType === 'location') typeInHindi = 'लोकेशन (Location)';
      else if (messageType === 'contacts') typeInHindi = 'कॉन्टैक्ट (Contact)';
      
      replyText = `नमस्ते ${contactName}! हमें आपका ${typeInHindi} प्राप्त हुआ है। हमारी सहायता टीम जल्द ही आपसे संपर्क करेगी।`;
    }
  }

  // Send the reply back to the user
  if (conversationId) {
    await sendWhatsAppMessage(env, phoneNumberId, from, replyText, conversationId, workspaceId);
  }
}

export async function sendWhatsAppMessage(
  env: Env,
  phoneNumberId: string,
  to: string,
  message: string,
  conversationId?: string | null,
  workspaceId?: string | null,
  messageType: string = 'text',
  mediaUrl?: string | null,
  filename?: string | null,
  location?: any | null,
  contacts?: any | null
) {
  let token = await env.SECRETS_KV.get('WHATSAPP_API_TOKEN');
  
  if (!token) {
    try {
      const config = await env.DB.prepare('SELECT access_token FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ access_token: string }>();
      if (config && config.access_token) {
        token = config.access_token;
      }
    } catch (e) {
      console.error('Failed to get workspace token', e);
    }
  }
  
  if (!token) {
    console.error('WhatsApp API Token is missing!');
    return;
  }

  // Uses Graph API v19.0 (Supports both Cloud API and WhatsApp Business App integrations)
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  // Build the message payload according to the type
  let payload: any = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: messageType
  };

  const isMediaId = mediaUrl && !mediaUrl.startsWith('http');
  const mediaObj = isMediaId ? { id: mediaUrl } : { link: mediaUrl };

  if (messageType === 'text') {
    payload.text = { body: message };
  } else if (messageType === 'image') {
    payload.image = { ...mediaObj, caption: message || "" };
  } else if (messageType === 'video') {
    payload.video = { ...mediaObj, caption: message || "" };
  } else if (messageType === 'document') {
    payload.document = { ...mediaObj, filename: filename || 'Document.pdf', caption: message || "" };
  } else if (messageType === 'location') {
    payload.location = {
      latitude: location?.latitude,
      longitude: location?.longitude,
      name: location?.name || 'Location',
      address: location?.address || ''
    };
  } else if (messageType === 'contacts') {
    payload.contacts = contacts;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data: any = await response.json();
    if (!response.ok) {
      console.error('WhatsApp Message Send Error:', data);
    } else {
      console.log(`Reply sent successfully to ${to}`);
      
      if (conversationId) {
        try {
          const sentMessageId = crypto.randomUUID();
          const platformMsgId = data.messages?.[0]?.id || null;



          await env.DB.prepare(`
            INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id, platform)
            VALUES (?, ?, 'bot', ?, ?, ?, ?, 'whatsapp')
          `).bind(sentMessageId, conversationId, messageType, message, mediaUrl || null, platformMsgId).run();

          // Broadcast bot reply via Durable Object
          if (workspaceId) try {
            const globalDoId = env.CHAT_DO.idFromName(`global-${workspaceId}`);
            const stub = env.CHAT_DO.get(globalDoId);
            const botMsgNow = new Date().toISOString();
            await stub.fetch(new Request('http://do/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'new_message',
                message: {
                  id: sentMessageId,
                  conversation_id: conversationId,
                  sender_type: 'bot',
                  message_type: messageType,
                  content: message || null,
                  media_url: mediaUrl || null,
                  platform_message_id: platformMsgId,
                  platform: 'whatsapp',
                  created_at: botMsgNow
                }
              })
            }));
          } catch (doErr) {
            console.error("Failed to broadcast bot reply to DO:", doErr);
          }
        } catch (dbError) {
           console.error('Failed to save bot reply to DB:', dbError);
        }
      }
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
  }
}
