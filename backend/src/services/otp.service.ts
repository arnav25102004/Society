import { redis } from '../config/redis';
import { env } from '../config/env';

const OTP_PREFIX = 'otp:';
const OTP_ATTEMPT_PREFIX = 'otp_attempts:';
const MAX_ATTEMPTS_PER_HOUR = 5;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendViaConsole(phone: string, otp: string): void {
  console.log(`\n📱 OTP for +91${phone}: ${otp}\n`);
}

// Fast2SMS "OTP route" — no DLT template registration required to get started.
// https://docs.fast2sms.com/#otp-message-route
async function sendViaFast2Sms(phone: string, otp: string): Promise<void> {
  const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
    method: 'POST',
    headers: {
      authorization: env.otp.fast2smsApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      route: 'otp',
      variables_values: otp,
      numbers: phone,
    }),
  });

  const data = (await res.json().catch(() => null)) as { return?: boolean; message?: unknown } | null;
  if (!res.ok || !data?.return) {
    throw new Error(`Fast2SMS send failed: ${res.status} ${JSON.stringify(data?.message ?? data)}`);
  }
}

// MSG91 requires a DLT-registered template; msg91TemplateId must reference that template
// and the template text must contain a ##OTP## (or equivalent) placeholder.
// https://docs.msg91.com/p/tf9GTextN/e/tdKQ0Sydx9/MSG91
async function sendViaMsg91(phone: string, otp: string): Promise<void> {
  const url = new URL('https://control.msg91.com/api/v5/otp');
  url.searchParams.set('otp', otp);
  url.searchParams.set('mobile', `91${phone}`);
  url.searchParams.set('template_id', env.otp.msg91TemplateId);
  url.searchParams.set('authkey', env.otp.msg91AuthKey);

  const res = await fetch(url.toString(), { method: 'POST' });
  const data = (await res.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (!res.ok || data?.type !== 'success') {
    throw new Error(`MSG91 send failed: ${res.status} ${JSON.stringify(data)}`);
  }
}

// ─── Main OTP service ─────────────────────────────────────────────────────────
export const otpService = {
  async send(phone: string): Promise<{ success: boolean; message: string }> {
    try {
      // Rate limit: max 5 OTPs per phone per hour
      const attemptsKey = `${OTP_ATTEMPT_PREFIX}${phone}`;
      const attempts = await redis.incr(attemptsKey);
      if (attempts === 1) await redis.expire(attemptsKey, 3600);
      const maxAttempts = env.isDev ? 1000 : MAX_ATTEMPTS_PER_HOUR;
      if (attempts > maxAttempts) {
        return { success: false, message: 'Too many OTP requests. Try again in an hour.' };
      }

      const otp = generateOtp();
      const key = `${OTP_PREFIX}${phone}`;
      await redis.setex(key, env.otp.expirySeconds, otp);

      switch (env.otp.provider) {
        case 'fast2sms':
          await sendViaFast2Sms(phone, otp);
          break;
        case 'msg91':
          await sendViaMsg91(phone, otp);
          break;
        case 'console':
        default:
          // Dev only — OTP visible in server terminal, never actually texted
          sendViaConsole(phone, otp);
      }

      return { success: true, message: 'OTP sent successfully' };
    } catch (err: any) {
      console.error('[OTP] Send failed:', err.message);
      return { success: false, message: `OTP system error: ${err.message}` };
    }
  },

  async verify(phone: string, otp: string): Promise<boolean> {
    // Master OTP for development
    if (env.isDev && otp === '000000') return true;

    const key = `${OTP_PREFIX}${phone}`;
    const stored = await redis.get(key);
    if (!stored || stored !== otp) return false;
    // Single-use: delete immediately after successful verification
    await redis.del(key);
    return true;
  },
};
