import type { CloudflareEnv } from "./cloudflare";

/**
 * Sends an email using Cloudflare's Email Routing/Send Email binding.
 */
export async function sendEmail(
  env: CloudflareEnv,
  to: string,
  subject: string,
  bodyText: string
) {
  try {
    // Cloudflare specific email routing capability using Send Email binding.
    // Ensure your wrangler.toml has:
    // send_email = [ { type = "send_email", name = "EMAIL_SENDER", destination_address = "admin@yourdomain.com" } ]
    
    // Note: If running inside standard Node during build, we safely bypass.
    if (!env || !env.EMAIL_SENDER) {
      console.warn("⚠️ EMAIL_SENDER binding not found. OTP mock printed to console:");
      console.warn(`To: ${to} | Subject: ${subject} | Body: ${bodyText}`);
      return;
    }

    // Creating standard Cloudflare EmailMessage
    // Requires sender domain to be verified in Cloudflare Email Routing.
    // Use a verified sender; override via EMAIL_FROM env if configured.
    const sender = (env && (env as any).EMAIL_FROM) || "notifications@dhitantra.com";
    
    // Some Cloudflare Email bindings require a raw MIME message constructed
    // We send a generic payload based on the modern email binding structure
    const emailPayload = {
      from: sender,
      to,
      subject,
      text: bodyText,
    };

    // Replace with standard MailChannels integration if using that fallback path:
    // await fetch("https://api.mailchannels.net/tx/v1/send", ... )

    // Example using direct binding, shape can differ based on experimental vs standard:
    if (typeof env.EMAIL_SENDER.send === 'function') {
      await env.EMAIL_SENDER.send(emailPayload);
    }
    
  } catch (err) {
    console.error("Failed to send email securely via Cloudflare edge:", err);
    throw err;
  }
}
