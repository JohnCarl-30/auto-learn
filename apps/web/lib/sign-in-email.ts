import 'server-only';
import type { EmailConfig } from 'next-auth/providers';

interface VerificationParams {
  identifier: string;
  url: string;
  provider: EmailConfig;
}

/**
 * Sends the sign-in link, or prints it when there is no way to send it.
 *
 * The printing is the point of writing this by hand. Without it, developing
 * sign-in requires a Resend account, a verified domain and a real inbox before
 * the first click can be tested — so the link goes to the server console when
 * no API key is configured, and local work needs a Postgres and nothing else.
 * Guarded on the key rather than on NODE_ENV, because a production deploy that
 * is missing its key should fail loudly at the send rather than quietly log a
 * credential to a log aggregator.
 */
export async function signInEmail({
  identifier,
  url,
  provider,
}: VerificationParams): Promise<void> {
  const key = provider.apiKey;

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'AUTH_RESEND_KEY is not set, so the sign-in link cannot be sent.',
      );
    }
    console.log(
      `\n  Sign-in link for ${identifier}\n  ${url}\n  (no AUTH_RESEND_KEY set, so this was not emailed)\n`,
    );
    return;
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: provider.from,
      to: identifier,
      subject: 'Your sign-in link for auto-learn',
      text: text(url),
      html: html(url),
    }),
  });

  if (!response.ok) {
    // The body carries the reason — an unverified sending domain, most often —
    // and it is worth having in the log rather than a bare status.
    throw new Error(`Resend refused the message: ${await response.text()}`);
  }
}

function text(url: string): string {
  return [
    'Sign in to auto-learn',
    '',
    url,
    '',
    'This link works once and expires in 15 minutes.',
    "If you didn't ask to sign in, you can ignore this.",
  ].join('\n');
}

/**
 * Inline styles and a table, which is how email has to be written: no external
 * stylesheet is loaded and no modern layout is reliable across clients. Kept
 * deliberately plain — a sign-in email that looks designed looks like phishing.
 */
function html(url: string): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" style="max-width:480px;margin:0 auto">
      <tr><td>
        <p style="font-size:16px;line-height:24px;margin:0 0 20px">Sign in to <strong>auto-learn</strong>.</p>
        <p style="margin:0 0 24px">
          <a href="${url}" style="display:inline-block;padding:12px 20px;background:#18181b;color:#fafafa;text-decoration:none;border-radius:8px;font-size:15px">Sign in</a>
        </p>
        <p style="font-size:13px;line-height:20px;color:#71717a;margin:0">
          This link works once and expires in 15 minutes.<br>
          If you didn't ask to sign in, you can ignore this email.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;
}
