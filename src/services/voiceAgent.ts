import { Env } from '../types';

export async function initiateVoiceAgentBridge(env: Env, workspaceId: string, from: string, aiVoiceInstructions: string, callId?: string, sdp?: string, phoneNumberId?: string) {
    console.log(`[VoiceAgent] Initiating Gemini Voice bridging for ${from} with instructions: ${aiVoiceInstructions}`);

    try {
        const geminiKey = await env.SECRETS_KV.get('GEMINI_API_KEY');
        if (!geminiKey) {
            console.error('[VoiceAgent] GEMINI_API_KEY is missing');
            return;
        }

        const globalDoId = env.CHAT_DO.idFromName(`global-${workspaceId}`);
        const globalStub = env.CHAT_DO.get(globalDoId);

        // Notify the frontend/DO that a Voice Session is active and waiting for WebRTC media
        await globalStub.fetch(new Request('http://do/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'voice_agent_active',
                payload: {
                    from,
                    workspaceId,
                    instructions: aiVoiceInstructions,
                    provider: 'gemini',
                    callId,
                    sdp,
                    phoneNumberId
                }
            })
        }));
    } catch (e) {
        console.error('[VoiceAgent] Failed to initiate voice agent bridge', e);
    }
}
