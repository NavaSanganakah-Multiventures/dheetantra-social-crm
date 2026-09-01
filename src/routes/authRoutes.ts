import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { EmailMessage } from 'cloudflare:email';
import { Env } from '../types';
import { getFreePlanId } from '../services/subscriptionService';

type SessionUser = {
  id: string;
  email: string;
  name: string;
  timezone: string;
  workspace_id?: string;
  role?: string;
};

const router = new Hono<{ Bindings: Env }>();

router.get('/api/auth/me', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) return c.json({ user: null }, 401);

  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) {
      const user: SessionUser = JSON.parse(userDataStr);
      if (c.env.DB && user?.id) {
        try {
          // Prefer the active workspace (x-workspace-id header) so the role
          // returned reflects the caller's membership in THAT workspace, not an
          // arbitrary first row. Falls back to the first membership when no
          // header is sent (e.g. right after login, before a workspace is chosen).
          const activeWorkspaceId = c.req.header('x-workspace-id');
          let wm: { workspace_id: string; role: string } | null = null;
          if (activeWorkspaceId) {
            wm = await c.env.DB.prepare(
              'SELECT workspace_id, role FROM workspace_members WHERE workspace_id = ? AND user_id = ?'
            ).bind(activeWorkspaceId, user.id).first<{ workspace_id: string; role: string }>();
          }
          if (!wm) {
            wm = await c.env.DB.prepare(
              'SELECT workspace_id, role FROM workspace_members WHERE user_id = ?'
            ).bind(user.id).first<{ workspace_id: string; role: string }>();
          }
          if (wm) {
            user.workspace_id = wm.workspace_id;
            user.role = wm.role;
          }
        } catch (e) {
          console.error('Failed to resolve workspace_id for /api/auth/me:', e);
        }
      }
      return c.json({ user });
    }
  } else {
    // Mock user for local development if KV is missing
    return c.json({ user: { email: 'dev@dhitantra.local', id: 'mock-user-123' } });
  }

  return c.json({ user: null }, 401);
});

router.post('/api/auth/send-otp', async (c) => {
  const { email, type = 'login', name } = await c.req.json();
  if (!email) return c.json({ error: 'Email is required' }, 400);

  // Check Database for user registration state
  if (c.env.DB) {
    try {
      const existingUser: any = await c.env.DB.prepare('SELECT id, is_registered, name FROM users WHERE email = ?').bind(email).first();
      const isRegistered = existingUser ? existingUser.is_registered === 1 : false;

      if (type === 'login' && !isRegistered) {
        return c.json({ error: 'Invalid credentials' }, 401);
      }
      if (type === 'register' && isRegistered) {
        return c.json({ error: 'This email is already registered.' }, 400);
      }

      // If registering and user doesn't exist, create user with is_registered = 0
      if (type === 'register') {
        if (!existingUser) {
          const userId = crypto.randomUUID();
          await c.env.DB.prepare('INSERT INTO users (id, email, name, is_registered) VALUES (?, ?, ?, 0)')
            .bind(userId, email, name || 'User').run();
        } else {
          await c.env.DB.prepare('UPDATE users SET name = ? WHERE email = ?')
            .bind(name || existingUser.name || 'User', email).run();
        }
      }
    } catch (err) {
      console.error("DB check failed:", err);
    }
  }

  if (c.env.SECRETS_KV) {
    const cooldownKey = `OTP_COOLDOWN:${email}`;
    const inCooldown = await c.env.SECRETS_KV.get(cooldownKey);
    if (inCooldown) {
      return c.json({ error: 'Please wait 60 seconds before requesting another OTP.' }, 429);
    }
    await c.env.SECRETS_KV.put(cooldownKey, '1', { expirationTtl: 60 });
  }

  // Generate a secure 6 digit OTP
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const otp = (array[0] % 900000 + 100000).toString();

  // Save OTP in Database
  if (c.env.DB) {
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now
      await c.env.DB.prepare('DELETE FROM otps WHERE email = ?').bind(email).run();
      const id = crypto.randomUUID();
      await c.env.DB.prepare('INSERT INTO otps (id, email, otp_code, expires_at) VALUES (?, ?, ?, ?)')
        .bind(id, email, otp, expiresAt).run();
    } catch (err) {
      console.error("DB OTP insert failed:", err);
    }
  }

  if (c.env.SECRETS_KV) {
    // Store type and name with the OTP for verification
    const payload = JSON.stringify({ otp, type, name });
    await c.env.SECRETS_KV.put(`OTP:${email}`, payload, { expirationTtl: 600 });
  }

  if (c.env.EMAIL_SENDER && typeof c.env.EMAIL_SENDER.send === 'function') {
    // Cloudflare Email Routing / Services logic
    try {
      const senderEmail = "dheetantra@navasanganakah.com";
      const senderName = "DheeTantra";
      // Sanitize user-controlled values before interpolating into raw email
      // headers: CR/LF in `email` would allow header injection (BCC spam etc.)
      const safeEmail = String(email).replace(/[\r\n]/g, '').trim();
      const safeOtp = String(otp).replace(/[\r\n]/g, '').trim();
      const rawEmail = `From: ${senderName} <${senderEmail}>\r\nTo: ${safeEmail}\r\nSubject: Dhitantra - ${type === 'register' ? 'Registration' : 'Login'} OTP\r\n\r\nYour code is: ${safeOtp}`;

      const message = new EmailMessage(senderEmail, safeEmail, rawEmail);
      await c.env.EMAIL_SENDER.send(message);

      console.log(`Email sent to ${safeEmail}`);
    } catch (err) {
      console.error("Failed to send email via Cloudflare:", err);
    }
  } else {
    // Fallback for local development
    console.log(`\n\n=== 🔐 OTP FOR ${email} (${type}) ===\n${otp}\n========================\n\n`);
  }

  return c.json({ success: true, message: 'OTP Sent' });
});

router.post('/api/user/settings', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  let user = null;
  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (userDataStr) user = JSON.parse(userDataStr);
  }
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const { timezone } = await c.req.json();
  if (timezone) {
    user.timezone = timezone;
    if (c.env.DB) {
      try {
        await c.env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(timezone, user.id).run();
      } catch (e) {
        console.error("Failed to update timezone in DB", e);
      }
    }
    if (c.env.SECRETS_KV) {
      await c.env.SECRETS_KV.put(`SESSION:${sessionId}`, JSON.stringify(user), { expirationTtl: 604800 });
    }
  }

  return c.json({ success: true, user });
});

router.post('/api/auth/verify-otp', async (c) => {
  const { email, otp } = await c.req.json();
  if (!email || !otp) return c.json({ error: 'Missing fields' }, 400);

  // Brute-force protection: max 10 failed attempts per email per 15 minutes.
  // A valid OTP resets the counter; exceeding it blocks further attempts.
  const attemptKey = `OTP_ATTEMPTS:${email}`;
  if (c.env.SECRETS_KV) {
    const attempts = parseInt(await c.env.SECRETS_KV.get(attemptKey) || '0', 10);
    if (attempts >= 10) {
      return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
    }
  }

  let isVerified = false;

  // 1. Verify OTP in D1 Database
  if (c.env.DB) {
    try {
      const now = Math.floor(Date.now() / 1000);
      const dbOtp: any = await c.env.DB.prepare('SELECT * FROM otps WHERE email = ? AND otp_code = ? AND expires_at > ?')
        .bind(email, otp, now).first();

      if (dbOtp) {
        isVerified = true;
        // Delete the verified OTP
        await c.env.DB.prepare('DELETE FROM otps WHERE email = ?').bind(email).run();
      }
    } catch (err) {
      console.error("DB OTP verification failed:", err);
    }
  }

  // 2. Fallback to SECRETS_KV
  if (!isVerified && c.env.SECRETS_KV) {
    const storedPayload = await c.env.SECRETS_KV.get(`OTP:${email}`);
    if (storedPayload) {
      try {
        const otpData = JSON.parse(storedPayload);
        if (otpData.otp === otp) {
          isVerified = true;
          await c.env.SECRETS_KV.delete(`OTP:${email}`);
        }
      } catch (e) {
        if (storedPayload === otp) {
          isVerified = true;
          await c.env.SECRETS_KV.delete(`OTP:${email}`);
        }
      }
    }
  }

  if (!isVerified) {
    // Record the failed attempt (15 min window)
    if (c.env.SECRETS_KV) {
      const attempts = parseInt(await c.env.SECRETS_KV.get(attemptKey) || '0', 10) + 1;
      await c.env.SECRETS_KV.put(attemptKey, String(attempts), { expirationTtl: 900 });
    }
    return c.json({ error: 'Invalid credentials' }, 401);
  }

  // Reset attempt counter on success
  if (c.env.SECRETS_KV) {
    await c.env.SECRETS_KV.delete(attemptKey);
  }

  let user: SessionUser = { id: crypto.randomUUID(), email, name: '', timezone: 'Asia/Kolkata' };
  let defaultWorkspaceId = crypto.randomUUID();

  const freePlanId = c.env.DB ? await getFreePlanId(c.env) : null;

  if (c.env.DB) {
    try {
      const existingUser: any = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

      if (existingUser) {
        user.id = existingUser.id;
        user.name = existingUser.name || 'User';
        user.timezone = existingUser.timezone || 'Asia/Kolkata';

        // If the user was registered with is_registered = 0, complete registration
        if (existingUser.is_registered === 0) {
          await c.env.DB.prepare('UPDATE users SET is_registered = 1 WHERE id = ?').bind(user.id).run();
        }

        // Check or create workspace
        const workspace: any = await c.env.DB.prepare('SELECT workspace_id, role FROM workspace_members WHERE user_id = ?').bind(user.id).first();
        // freePlanId was already resolved above (outer scope); reuse it
        // instead of shadowing with a second redundant getFreePlanId() DB call.
        if (workspace) {
          defaultWorkspaceId = workspace.workspace_id;
          user.workspace_id = workspace.workspace_id;
          user.role = workspace.role;
        } else {
          await c.env.DB.prepare('INSERT INTO workspaces (id, name, plan_id) VALUES (?, ?, ?)')
            .bind(defaultWorkspaceId, `${user.name || 'My'} Workspace`, freePlanId).run();
          await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
            .bind(defaultWorkspaceId, user.id, 'owner').run();
          user.workspace_id = defaultWorkspaceId;
          user.role = 'owner';
        }
      } else {
        // Fallback user creation if not exists in DB yet (e.g. bypass or DB schema updated)
        const userId = crypto.randomUUID();
        await c.env.DB.prepare('INSERT INTO users (id, email, name, is_registered) VALUES (?, ?, ?, 1)')
          .bind(userId, email, 'User').run();
        user.id = userId;
        user.name = 'User';

        await c.env.DB.prepare('INSERT INTO workspaces (id, name, plan_id) VALUES (?, ?, ?)')
          .bind(defaultWorkspaceId, `My Workspace`, freePlanId).run();
        await c.env.DB.prepare('INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, ?)')
          .bind(defaultWorkspaceId, userId, 'owner').run();
        user.workspace_id = defaultWorkspaceId;
        user.role = 'owner';
      }
    } catch (err) {
      // NEVER proceed with a random-UUID user when the DB is configured but
      // failing: the session would point at a user row that does not exist.
      console.error("DB operations failed during OTP verification:", err);
      return c.json({ error: 'Internal server error. Please try again.' }, 500);
    }
  }

  const sessionId = crypto.randomUUID();
  if (c.env.SECRETS_KV) {
    await c.env.SECRETS_KV.put(`SESSION:${sessionId}`, JSON.stringify(user), { expirationTtl: 604800 });
  }

  setCookie(c, 'auth_session', sessionId, {
    httpOnly: true,
    secure: c.env.ENVIRONMENT === 'production',
    sameSite: 'Lax',
    maxAge: 604800,
    path: '/',
  });

  return c.json({ success: true, user, workspaceId: defaultWorkspaceId, sessionId });
});

// Returns the caller's own session id. Mobile apps need this because they
// cannot read the httpOnly auth_session cookie used by the browser dashboard.
// The token is then passed as a query parameter on the realtime WebSocket.
router.get('/api/auth/session-token', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401);

  if (c.env.SECRETS_KV) {
    const userDataStr = await c.env.SECRETS_KV.get(`SESSION:${sessionId}`);
    if (!userDataStr) return c.json({ error: 'Unauthorized' }, 401);
  }

  c.res.headers.set('Cache-Control', 'no-store');
  return c.json({ sessionId });
});

router.post('/api/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'auth_session');
  if (sessionId && c.env.SECRETS_KV) {
    await c.env.SECRETS_KV.delete(`SESSION:${sessionId}`);
  }
  deleteCookie(c, 'auth_session', { path: '/' });
  return c.json({ success: true });
});

// ==========================================
// WHATSAPP CLOUD API INTEGRATION
// ==========================================

// Webhook Verification (WhatsApp uses GET request for verification)

export default router;
