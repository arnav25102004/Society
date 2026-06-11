import { redis } from '../config/redis';
import { env } from '../config/env';

const OTP_PREFIX = 'otp:';
const OTP_ATTEMPT_PREFIX = 'otp_attempts:';
const MAX_ATTEMPTS_PER_HOUR = 5;

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Fast2SMS (free Indian SMS, no DLT required for OTP route) ────────────────
async function sendViaFast2SMS(phone: string, otp: string): Promise<void> {
  const url = 'https://www.fast2sms.com/dev/bulkV2';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: env.otp.fast2smsApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      route: 'otp',
      variables_values: otp,
      numbers: phone,
      flash: 0,
    }),
  });
  const json = (await resp.json()) as { return: boolean; message: string[] };
  if (!json.return) {
    throw new Error(`Fast2SMS error: ${json.message?.join(', ')}`);
  }
}

// ─── MSG91 (paid, ₹0.28/SMS, needs DLT template registration) ────────────────
async function sendViaMSG91(phone: string, otp: string): Promise<void> {
  const url = `https://api.msg91.com/api/v5/otp?template_id=${env.otp.msg91TemplateId}&mobile=91${phone}&authkey=${env.otp.msg91AuthKey}&otp=${otp}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`MSG91 error: ${resp.statusText}`);
}

// ─── Main OTP service ─────────────────────────────────────────────────────────
export const otpService = {
  async send(phone: string): Promise<{ success: boolean; message: string }> {
    // Rate limit: max 5 OTPs per phone per hour
    const attemptsKey = `${OTP_ATTEMPT_PREFIX}${phone}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 3600);
    if (attempts > MAX_ATTEMPTS_PER_HOUR) {
      return { success: false, message: 'Too many OTP requests. Try again in an hour.' };
    }

    const otp = generateOtp();
    const key = `${OTP_PREFIX}${phone}`;
    await redis.setex(key, env.otp.expirySeconds, otp);

    try {
      if (env.otp.provider === 'console') {
        // Dev only — OTP visible in server terminal
        console.log(`\n📱 OTP for +91${phone}: ${otp}\n`);
      } else if (env.otp.provider === 'fast2sms') {
        await sendViaFast2SMS(phone, otp);
      } else if (env.otp.provider === 'msg91') {
        await sendViaMSG91(phone, otp);
      }
    } catch (err) {
      // SMS delivery failure — remove stored OTP and surface error
      await redis.del(key);
      console.error('[OTP] Delivery failed:', err);
      return { success: false, message: 'Failed to send OTP. Please try again.' };
    }

    return { success: true, message: 'OTP sent successfully' };
  },

  async verify(phone: string, otp: string): Promise<boolean> {
    const key = `${OTP_PREFIX}${phone}`;
    const stored = await redis.get(key);
    if (!stored || stored !== otp) return false;
    // Single-use: delete immediately after successful verification
    await redis.del(key);
    return true;
  },
};
