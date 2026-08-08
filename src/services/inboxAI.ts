import { GoogleGenAI } from '@google/genai';
import { Env } from '../types';

// Labels the unified inbox can filter on. Keep in sync with the UI dropdown.
export const AI_LABELS = ['lead', 'urgent', 'complaint', 'inquiry', 'support', 'follow_up', 'spam', 'other'] as const;
export type AiLabel = typeof AI_LABELS[number];

const MODEL = 'gemini-3.5-flash';

async function getGemini(env: Env): Promise<GoogleGenAI | null> {
  const key = await env.SECRETS_KV.get('GEMINI_API_KEY');
  return key ? new GoogleGenAI({ apiKey: key }) : null;
}

interface ClassifyInput {
  id: string;
  platform: string;
  contact_name: string;
  last_message: string;
  message_count: number;
}

interface ClassifyResult {
  id: string;
  label: string;
  summary: string;
}

/**
 * Classifies the workspace's recent conversations with Gemini and persists
 * ai_label + ai_summary on each row. Only conversations updated in the last
 * 7 days are considered so stale rows are not re-processed on every run.
 */
export async function classifyConversations(env: Env, workspaceId: string): Promise<{ classified: number; failed: boolean }> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.id, c.platform, ct.name AS contact_name, c.updated_at,
              (SELECT content FROM messages m WHERE m.conversation_id = c.id
               ORDER BY m.rowid DESC LIMIT 1) AS last_message,
              (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count
       FROM conversations c
       JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.workspace_id = ? AND c.updated_at >= datetime('now', '-7 days')
       ORDER BY c.updated_at DESC
       LIMIT 60`
    ).bind(workspaceId).all();

    const rows = (results || []) as unknown as ClassifyInput[];
    if (rows.length === 0) return { classified: 0, failed: false };

    const gemini = await getGemini(env);
    if (!gemini) return { classified: 0, failed: true };

    const prompt = `You classify customer conversations for a CRM inbox.
Allowed labels: ${AI_LABELS.join(', ')}.
Return ONLY a JSON array (no markdown, no code fences) of objects with fields "id", "label" (one of the allowed labels), and "summary" (max 8 words, in the message language).
Rules: "lead" = buying intent or product/service question with budget/timing; "urgent" = angry, abusive, deadline-close or payment issues; "complaint" = dissatisfaction or fault reports; "inquiry" = questions about price/features/availability; "support" = help with existing service; "follow_up" = conversation needs a reply or is awaiting action; "spam" = promotional/irrelevant; otherwise "other".

Conversations:
${JSON.stringify(rows)}`;

    const aiResponse = await gemini.models.generateContent({ model: MODEL, contents: prompt });
    const text = (aiResponse.text || '').trim().replace(/^```(json)?|```$/g, '').trim();

    let parsed: ClassifyResult[];
    try {
      parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('not an array');
    } catch {
      console.error('[InboxAI] Failed to parse classify response:', text.slice(0, 300));
      return { classified: 0, failed: true };
    }

    let classified = 0;
    for (const item of parsed) {
      if (!item || !item.id) continue;
      const label = AI_LABELS.includes(item.label as AiLabel) ? item.label : 'other';
      const summary = (item.summary || '').toString().slice(0, 200);
      await env.DB.prepare(
        'UPDATE conversations SET ai_label = ?, ai_summary = ? WHERE id = ? AND workspace_id = ?'
      ).bind(label, summary, item.id, workspaceId).run();
      classified++;
    }
    return { classified, failed: false };
  } catch (e) {
    console.error('[InboxAI] classify error:', e);
    return { classified: 0, failed: true };
  }
}

/**
 * Generates a reply draft for a conversation from its recent message history.
 */
export async function suggestReply(
  env: Env,
  workspaceId: string,
  conversationId: string
): Promise<{ suggestion: string; failed: boolean }> {
  try {
    const conv: any = await env.DB.prepare(
      `SELECT c.id, c.platform, ct.name AS contact_name,
              ct.platform_contact_id AS contact_id_value
       FROM conversations c JOIN contacts ct ON c.contact_id = ct.id
       WHERE c.id = ? AND c.workspace_id = ?`
    ).bind(conversationId, workspaceId).first();
    if (!conv) return { suggestion: '', failed: true };

    const { results } = await env.DB.prepare(
      `SELECT sender_type, content, created_at FROM messages
       WHERE conversation_id = ? ORDER BY rowid ASC LIMIT 20`
    ).bind(conversationId).all();

    const history = (results || [])
      .filter((m: any) => m.content)
      .map((m: any) => `${m.sender_type === 'contact' ? 'Customer' : 'Agent'}: ${m.content}`)
      .join('\n');

    const gemini = await getGemini(env);
    if (!gemini) return { suggestion: '', failed: true };

    const prompt = `You are a customer support assistant writing a reply for the DheeTantra CRM.
Platform: ${conv.platform}
Customer: ${conv.contact_name || 'Customer'}
Conversation history:
${history || '(no messages yet)'}

Write a concise, professional reply in the same language as the customer's latest message.
Rules: keep it under 120 words; do not invent facts; if a question cannot be answered from context, ask for the missing details politely; never include greetings like "As an AI".
Return ONLY the reply text.`;

    const aiResponse = await gemini.models.generateContent({ model: MODEL, contents: prompt });
    const suggestion = (aiResponse.text || '').trim();
    return { suggestion, failed: !suggestion };
  } catch (e) {
    console.error('[InboxAI] suggest error:', e);
    return { suggestion: '', failed: true };
  }
}
