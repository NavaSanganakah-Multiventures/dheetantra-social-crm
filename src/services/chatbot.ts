import { Env } from '../types';

export async function handleIncomingMessage(
  env: Env,
  phoneNumberId: string,
  from: string,
  messageText: string,
  contactName: string,
  messageId?: string
) {
  // Find the workspace ID for this phone number
  let workspaceId: string | null = null;
  try {
    const config = await env.DB.prepare('SELECT workspace_id FROM whatsapp_configs WHERE phone_number_id = ?').bind(phoneNumberId).first<{ workspace_id: string }>();
    if (config) {
      workspaceId = config.workspace_id;
    }
  } catch (error) {
    console.error('Error fetching whatsapp_config:', error);
  }

  let conversationId: string | null = null;

  // Let's implement saving
  if (workspaceId) {
    try {
      // 1. Upsert contact
      const contactId = crypto.randomUUID();
      const contactResult = await env.DB.prepare(`
        INSERT INTO contacts (id, workspace_id, platform, platform_contact_id, name)
        VALUES (?, ?, 'whatsapp', ?, ?)
        ON CONFLICT (workspace_id, platform, platform_contact_id) 
        DO UPDATE SET name=excluded.name
        RETURNING id
      `).bind(contactId, workspaceId, from, contactName).first<{ id: string }>();

      const finalContactId = contactResult?.id || contactId;

      // 2. Find or create conversation
      const existingConv = await env.DB.prepare(`
        SELECT id FROM conversations WHERE contact_id = ? AND platform = 'whatsapp' ORDER BY created_at DESC LIMIT 1
      `).bind(finalContactId).first<{ id: string }>();

      if (existingConv) {
        conversationId = existingConv.id;
      } else {
        conversationId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO conversations (id, workspace_id, contact_id, platform, status)
          VALUES (?, ?, ?, 'whatsapp', 'open')
        `).bind(conversationId, workspaceId, finalContactId).run();
      }

      // 3. Save incoming message
      if (messageId) {
        const incomingMessageId = crypto.randomUUID();
        await env.DB.prepare(`
          INSERT INTO messages (id, conversation_id, sender_type, content, platform_message_id)
          VALUES (?, ?, 'contact', ?, ?)
        `).bind(incomingMessageId, conversationId, messageText, messageId).run();
      }

    } catch (error) {
      console.error('Error saving incoming message:', error);
    }
  }

  // Chatbot logic - Supports both standard Cloud API and WhatsApp Business App integrations
  
  let replyText = `नमस्ते ${contactName}! Dhitantra प्लेटफॉर्म में आपका स्वागत है।\n\n`;

  const text = messageText.toLowerCase().trim();

  // Basic Intent Matching
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

  // Send the reply back to the user
  await sendWhatsAppMessage(env, phoneNumberId, from, replyText, conversationId);
}

export async function sendWhatsAppMessage(env: Env, phoneNumberId: string, to: string, message: string, conversationId?: string | null) {
  const token = await env.SECRETS_KV.get('WHATSAPP_API_TOKEN');
  
  if (!token) {
    console.error('WhatsApp API Token is missing!');
    return;
  }

  // Uses Graph API v19.0 (Supports both Cloud API and WhatsApp Business App integrations)
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: message }
      }),
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
            INSERT INTO messages (id, conversation_id, sender_type, content, platform_message_id)
            VALUES (?, ?, 'bot', ?, ?)
          `).bind(sentMessageId, conversationId, message, platformMsgId).run();
        } catch (dbError) {
           console.error('Failed to save bot reply to DB:', dbError);
        }
      }
    }
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error);
  }
}
