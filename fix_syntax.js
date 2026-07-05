const fs = require('fs');
const content = fs.readFileSync('src/index.ts', 'utf8');

const target = `    return c.json({ error: err.message }, 500);
  }
});fields.includes('calls');
        }
      }
    } catch (e) {
      console.error('[Calling Status] Failed to check webhook subscription:', e);
    }
  }

  // Check TURN/ICE configuration
  const turnKeyId = await c.env.SECRETS_KV.get('CLOUDFLARE_CALLS_APP_ID').catch(() => null);
  const turnToken = await c.env.SECRETS_KV.get('CLOUDFLARE_API_TOKEN').catch(() => null);

  return c.json({
    phone_numbers: phoneResults,
    webhook_subscribed: webhookCallsFieldHint,
    turn_configured: !!(turnKeyId && turnToken),
    all_ready: phoneResults.every(p => p.db_calling_enabled) && webhookCallsFieldHint
  });
});`;

const replacement = `    return c.json({ error: err.message }, 500);
  }
});`;

if (content.includes(target)) {
  const newContent = content.replace(target, replacement);
  fs.writeFileSync('src/index.ts', newContent);
  console.log("Fix applied!");
} else {
  console.log("Target not found!");
}
