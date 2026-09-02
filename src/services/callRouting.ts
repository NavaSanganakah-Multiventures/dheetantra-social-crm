import { Env } from '../types';
import { sqliteNow } from '../shared';

// ---------------------------------------------------------------------------
// Shared call-routing helpers for the DheeTantra voice redesign.
//
// Design goals:
//   1. Only agents with voice_status = 'live' (available) receive ring pushes.
//   2. All available agents ring SIMULTANEOUSLY — any agent can pick up.
//   3. When an agent ANSWERS, all other agents' rings stop (call_answered).
//   4. When an agent DECLINES, only THEIR ring stops; others keep ringing.
//   5. If an agent is on a WhatsApp call they are 'busy' and don't receive
//      Plivo/Twilio rings — busy/offline agents are excluded.
//   6. The call auto-ends (missed) only when ALL ringing agents decline/timeout.
// ---------------------------------------------------------------------------

/** Mark an agent as busy so they don't receive new rings. */
export async function markAgentBusy(env: Env, workspaceId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE workspace_members SET voice_status = 'busy', voice_status_updated_at = ? WHERE workspace_id = ? AND user_id = ?"
  ).bind(sqliteNow(), workspaceId, userId).run();
}

/** Restore a busy agent back to 'live' (call ended / declined). */
export async function restoreAgentStatus(env: Env, workspaceId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE workspace_members SET voice_status = 'live', voice_status_updated_at = ? WHERE workspace_id = ? AND user_id = ? AND voice_status = 'busy'"
  ).bind(sqliteNow(), workspaceId, userId).run();
}

/** Return user_ids of all agents currently 'live' (available) in a workspace. */
export async function getLiveAgentUserIds(env: Env, workspaceId: string): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT user_id FROM workspace_members WHERE workspace_id = ? AND voice_status = 'live'"
  ).bind(workspaceId).all<{ user_id: string }>();
  return (results || []).map(r => r.user_id);
}

/**
 * Record which agents are ringing for a call (inserted into call_ringing_agents).
 * Call this once when the ring push is first sent to the live agents.
 */
export async function trackRingingAgents(
  env: Env,
  callId: string,
  workspaceId: string,
  userIds: string[],
  source: string,
): Promise<void> {
  if (!userIds.length) return;
  const now = sqliteNow();
  const stmts = userIds.map(uid =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO call_ringing_agents (call_id, user_id, workspace_id, status, device_source, created_at, updated_at) VALUES (?, ?, ?, 'ringing', ?, ?, ?)"
    ).bind(callId, uid, workspaceId, source, now, now)
  );
  await env.DB.batch(stmts);
}

/**
 * Mark a single agent as declined. Only their ring stops — the call and other
 * agents' rings are NOT affected.
 */
export async function markAgentDeclined(env: Env, callId: string, userId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE call_ringing_agents SET status = 'declined', updated_at = ? WHERE call_id = ? AND user_id = ? AND status = 'ringing'"
  ).bind(sqliteNow(), callId, userId).run();
}

/**
 * Atomically claim a call for an agent. Returns true if this agent won the
 * race (was the first to answer); false if someone else already answered.
 * On success: sets answered_by_user_id, assigned_user_id, marks agent busy,
 * and marks the agent's ringing row as 'answered'.
 */
export async function claimCallAnswer(
  env: Env,
  callId: string,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  // Atomic: only the first agent wins (answered_by_user_id IS NULL guard).
  const result = await env.DB.prepare(
    "UPDATE calls SET answered_by_user_id = ?, assigned_user_id = COALESCE(assigned_user_id, ?) WHERE id = ? AND answered_by_user_id IS NULL"
  ).bind(userId, userId, callId).run();

  if (!result.meta?.changes || result.meta.changes === 0) {
    return false; // someone else already answered
  }

  await env.DB.prepare(
    "UPDATE call_ringing_agents SET status = 'answered', updated_at = ? WHERE call_id = ? AND user_id = ?"
  ).bind(sqliteNow(), callId, userId).run();

  await markAgentBusy(env, workspaceId, userId);
  return true;
}

/** Mark all other (still-ringing) agents as 'ended' once the call is answered. */
export async function markOtherRingingEnded(env: Env, callId: string, answeredByUserId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE call_ringing_agents SET status = 'ended', updated_at = ? WHERE call_id = ? AND user_id != ? AND status = 'ringing'"
  ).bind(sqliteNow(), callId, answeredByUserId).run();
}

/** Broadcast 'call_answered' via the workspace Durable Object WebSocket. */
export async function broadcastCallAnswered(
  env: Env,
  workspaceId: string,
  callId: string,
  answeredByUserId: string,
  source: string,
): Promise<void> {
  try {
    const globalDoId = env.CHAT_DO.idFromName('global-' + workspaceId);
    const globalDo = env.CHAT_DO.get(globalDoId);
    await globalDo.fetch(new Request('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'call_answered',
        callId,
        answeredByUserId,
        source,
        workspaceId,
      }),
    }));
  } catch (e) {
    console.error('[CallRouting] broadcastCallAnswered error:', e);
  }
}

/**
 * Send a silent FCM 'call_answered' push to ALL agents in the workspace so
 * that killed / backgrounded apps dismiss their native CallKit ring too.
 */
export async function pushCallAnsweredToAgents(
  env: Env,
  workspaceId: string,
  callId: string,
  answeredByUserId: string,
  source: string,
): Promise<void> {
  try {
    const members = await env.DB.prepare('SELECT user_id FROM workspace_members WHERE workspace_id = ?')
      .bind(workspaceId).all<{ user_id: string }>();
    if (!members.results || members.results.length === 0) return;

    const userIds = members.results.map(m => m.user_id);
    const placeholders = userIds.map(() => '?').join(',');
    const tokens = await env.DB.prepare('SELECT token FROM fcm_tokens WHERE user_id IN (' + placeholders + ')')
      .bind(...userIds).all<{ token: string }>();
    if (!tokens.results || tokens.results.length === 0) return;

    const { sendPushNotification } = await import('../lib/fcm');
    const CHUNK = 25;
    const targets = tokens.results.slice(-45);
    for (let start = 0; start < targets.length; start += CHUNK) {
      const chunk = targets.slice(start, start + CHUNK);
      await Promise.allSettled(
        chunk.map(row =>
          sendPushNotification(
            env,
            row.token,
            '',
            '',
            {
              workspaceId,
              type: 'call_answered',
              callId,
              answeredByUserId,
              source,
            },
            { ttlSeconds: 0, category: 'call', dataOnly: true }
          )
        )
      );
    }
  } catch (e) {
    console.error('[CallRouting] pushCallAnsweredToAgents error:', e);
  }
}

/**
 * Convenience: broadcast + push the 'call_answered' signal to every agent.
 * Called by each provider's answer path once an agent wins the race.
 */
export async function notifyCallAnswered(
  env: Env,
  workspaceId: string,
  callId: string,
  answeredByUserId: string,
  source: string,
): Promise<void> {
  await markOtherRingingEnded(env, callId, answeredByUserId);
  await broadcastCallAnswered(env, workspaceId, callId, answeredByUserId, source);
  await pushCallAnsweredToAgents(env, workspaceId, callId, answeredByUserId, source);
}

/**
 * Check whether all ringing agents for a call have declined. If so, mark the
 * call as 'missed' and broadcast the status. Returns true if the call was
 * ended because nobody is left to answer.
 */
export async function checkAllAgentsDeclined(env: Env, callId: string, workspaceId: string, source: string): Promise<boolean> {
  const remaining = await env.DB.prepare(
    "SELECT COUNT(*) as cnt FROM call_ringing_agents WHERE call_id = ? AND status = 'ringing'"
  ).bind(callId).first<{ cnt: number }>();

  if (remaining && remaining.cnt === 0) {
    await env.DB.prepare(
      "UPDATE calls SET status = 'missed', ended_at = ? WHERE id = ? AND status IN ('ringing','dialing')"
    ).bind(sqliteNow(), callId).run();

    await env.DB.prepare(
      "UPDATE call_ringing_agents SET status = 'ended', updated_at = ? WHERE call_id = ? AND status = 'declined'"
    ).bind(sqliteNow(), callId).run();

    try {
      const globalDoId = env.CHAT_DO.idFromName('global-' + workspaceId);
      const globalDo = env.CHAT_DO.get(globalDoId);
      await globalDo.fetch(new Request('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'call_status_updated',
          call_id: callId,
          status: 'missed',
          duration: 0,
          source,
        }),
      }));
    } catch (e) { }

    return true;
  }
  return false;
}

/**
 * End the call completely: restore the answered agent to 'live', mark all
 * ringing-agent rows as 'ended', and broadcast the terminal status.
 */
export async function cleanupCallRinging(
  env: Env,
  callId: string,
  workspaceId: string,
  answeredByUserId: string | null,
): Promise<void> {
  if (answeredByUserId) {
    await restoreAgentStatus(env, workspaceId, answeredByUserId);
  }
  await env.DB.prepare(
    "UPDATE call_ringing_agents SET status = 'ended', updated_at = ? WHERE call_id = ? AND status IN ('ringing','declined')"
  ).bind(sqliteNow(), callId).run();
}
