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

      // Dev only — OTP visible in server terminal
      sendViaConsole(phone, otp);

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
