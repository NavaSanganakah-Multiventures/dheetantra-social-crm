import { Env } from '../types';

export async function initiateVoiceAgentBridge(env: Env, workspaceId: string, from: string, aiVoiceInstructions: string) {
    // This function can set up a Durable Object session state or directly signal to connect Gemini Live API
    // Since actual WebRTC audio bridging requires frontend or a dedicated WebRTC media server,
    // we establish a "Session" in the Durable Object to expect Gemini bridging instructions.

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
                    provider: 'gemini'
                }
            })
        }));
    } catch (e) {
        console.error('[VoiceAgent] Failed to initiate voice agent bridge', e);
    }
}
