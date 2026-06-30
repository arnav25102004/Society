/**
 * Phase 1 auth test script.
 * Run: npx ts-node src/scripts/test-auth.ts
 *
 * Verifies:
 *   1. Login flow (OTP send → verify → get tokens)
 *   2. Access token works for /auth/me
 *   3. Refresh token rotation works (family tracking)
 *   4. Reusing an old refresh token (after rotation) triggers theft detection
 *   5. 5 wrong OTPs in a row trigger account lockout (HTTP 429)
 *   6. PIN set and verify flow
 *   7. Device listing endpoint
 */

import 'dotenv/config';

const BASE = `http://localhost:${process.env.PORT ?? 3000}/api/v1`;
const PHONE = '9999988888'; // test phone — OTP printed to console

type AnyJson = Record<string, unknown>;

async function post(path: string, body: AnyJson, headers: Record<string, string> = {}): Promise<[number, AnyJson]> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return [r.status, await r.json() as AnyJson];
}

async function get(path: string, token: string): Promise<[number, AnyJson]> {
  const r = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return [r.status, await r.json() as AnyJson];
}

async function del(path: string, token: string, body?: AnyJson): Promise<[number, AnyJson]> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  return [r.status, await r.json() as AnyJson];
}

function pass(msg: string) { console.log(`  ✅  ${msg}`); }
function fail(msg: string, detail?: unknown) { console.error(`  ❌  ${msg}`, detail ?? ''); process.exitCode = 1; }

async function run() {
  console.log('\n═══════════════════════════════════════');
  console.log('  Phase 1 Authentication Test Suite');
  console.log('═══════════════════════════════════════\n');

  // ── 1. Send OTP ────────────────────────────────────────────────────────────
  console.log('1. Sending OTP...');
  const [sendStatus, sendBody] = await post('/auth/send-otp', { phone: PHONE });
  if (sendStatus === 200 && (sendBody as AnyJson).success) {
    pass('OTP sent successfully');
  } else {
    fail('OTP send failed', sendBody);
    return;
  }

  // The OTP is printed to the console by the server. In test we read it from there.
  // For automated testing we use the Redis key directly.
  const { redis } = await import('../config/redis');
  const otp = await redis.get(`otp:${PHONE}`);
  if (!otp) { fail('OTP not found in Redis'); return; }
  pass(`OTP retrieved from Redis: ${otp}`);

  // ── 2. Verify OTP → get tokens ────────────────────────────────────────────
  console.log('\n2. Verifying OTP...');
  const [verifyStatus, verifyBody] = await post('/auth/verify-otp', {
    phone:      PHONE,
    otp,
    deviceId:   'test-device-001',
    deviceName: 'Test Runner',
  });
  if (verifyStatus === 200 && (verifyBody as AnyJson).success) {
    pass('OTP verified — tokens issued');
  } else {
    fail('OTP verify failed', verifyBody);
    return;
  }
  const { accessToken, refreshToken } = (verifyBody as AnyJson).tokens as { accessToken: string; refreshToken: string };
  pass(`Access token (first 40 chars): ${accessToken.slice(0, 40)}...`);

  // ── 3. /auth/me works with access token ───────────────────────────────────
  console.log('\n3. Calling /auth/me...');
  const [meStatus, meBody] = await get('/auth/me', accessToken);
  if (meStatus === 200 && (meBody as AnyJson).success) {
    pass(`/auth/me returned user — phone masked: ...${PHONE.slice(-4)}`);
  } else {
    fail('/auth/me failed', meBody);
  }

  // ── 4. Refresh token rotation ─────────────────────────────────────────────
  console.log('\n4. Testing refresh token rotation...');
  const [r1Status, r1Body] = await post('/auth/refresh-token', { refreshToken });
  if (r1Status === 200 && (r1Body as AnyJson).success) {
    pass('Refresh succeeded — new tokens issued');
  } else {
    fail('Refresh failed', r1Body);
    return;
  }
  const newRefreshToken = (r1Body as AnyJson).refreshToken as string;
  const newAccessToken  = (r1Body as AnyJson).accessToken  as string;
  pass('New refresh token obtained (family rotation)');

  // ── 5. Reusing old refresh token should trigger theft detection ───────────
  console.log('\n5. Reusing OLD refresh token (theft detection)...');
  const [staleStatus, staleBody] = await post('/auth/refresh-token', { refreshToken });
  if (staleStatus === 401) {
    pass('Theft detection triggered — old token rejected');
    if ((staleBody as AnyJson).message?.toString().includes('invalidated')) {
      pass('Family invalidation message present');
    }
  } else {
    fail('Expected 401 on reused token, got', staleStatus);
  }

  // ── 6. New refresh token should also be dead (family was nuked) ───────────
  const [familyStatus] = await post('/auth/refresh-token', { refreshToken: newRefreshToken });
  if (familyStatus === 401) {
    pass('Entire family invalidated after theft detection');
  } else {
    fail('Expected family to be invalidated after theft, got', familyStatus);
  }

  // ── 7. Get fresh tokens for remaining tests ───────────────────────────────
  await post('/auth/send-otp', { phone: PHONE });
  const freshOtp = await redis.get(`otp:${PHONE}`);
  const [, freshBody] = await post('/auth/verify-otp', { phone: PHONE, otp: freshOtp!, deviceId: 'test-device-001' });
  const freshAccess  = ((freshBody as AnyJson).tokens as AnyJson).accessToken  as string;
  const freshRefresh = ((freshBody as AnyJson).tokens as AnyJson).refreshToken as string;

  // ── 8. Account lockout after 5 failed OTPs ────────────────────────────────
  console.log('\n6. Account lockout test (5 wrong OTPs)...');
  // First clear any existing lockout
  await post('/auth/send-otp', { phone: '9999977777' });
  let lastStatus = 0;
  for (let i = 1; i <= 6; i++) {
    const [s] = await post('/auth/verify-otp', { phone: '9999977777', otp: '000000' });
    lastStatus = s;
    if (i < 5) {
      if (s === 401) pass(`Attempt ${i}: rejected with 401`);
      else fail(`Attempt ${i}: expected 401, got ${s}`);
    }
  }
  if (lastStatus === 429) {
    pass('Account locked after 5 failures — HTTP 429 returned');
  } else {
    fail(`Expected 429 after lockout, got ${lastStatus}`);
  }

  // ── 9. PIN set and verify ─────────────────────────────────────────────────
  console.log('\n7. PIN set/verify flow...');
  const [pinSetStatus, pinSetBody] = await post('/auth/pin/set', { pin: '123456' }, {
    Authorization: `Bearer ${freshAccess}`,
  });
  if (pinSetStatus === 200) {
    pass('PIN set successfully');
  } else {
    fail('PIN set failed', pinSetBody);
  }

  const [pinVerifyStatus, pinVerifyBody] = await post('/auth/pin/verify', { pin: '123456' }, {
    Authorization: `Bearer ${freshAccess}`,
  });
  if (pinVerifyStatus === 200 && (pinVerifyBody as AnyJson).sensitiveActionToken) {
    pass('PIN verified — sensitiveActionToken returned');
  } else {
    fail('PIN verify failed', pinVerifyBody);
  }

  const [wrongPinStatus] = await post('/auth/pin/verify', { pin: '999999' }, {
    Authorization: `Bearer ${freshAccess}`,
  });
  if (wrongPinStatus === 401) {
    pass('Wrong PIN correctly rejected');
  } else {
    fail(`Expected 401 for wrong PIN, got ${wrongPinStatus}`);
  }

  // ── 10. Device listing ────────────────────────────────────────────────────
  console.log('\n8. Device listing...');
  const [devStatus, devBody] = await get('/auth/devices', freshAccess);
  if (devStatus === 200 && Array.isArray((devBody as AnyJson).devices)) {
    const devices = (devBody as AnyJson).devices as AnyJson[];
    pass(`Device list returned (${devices.length} device(s))`);
    if (devices.some(d => d.deviceId === 'test-device-001')) {
      pass('Test device appears in list');
    }
  } else {
    fail('Device list failed', devBody);
  }

  // ── 11. Logout ─────────────────────────────────────────────────────────────
  console.log('\n9. Logout...');
  const [logoutStatus] = await del('/auth/logout', freshAccess, { refreshToken: freshRefresh });
  if (logoutStatus === 200) {
    pass('Logout successful');
  } else {
    fail('Logout failed');
  }

  // Refresh should fail after logout
  const [postLogoutStatus] = await post('/auth/refresh-token', { refreshToken: freshRefresh });
  if (postLogoutStatus === 401) {
    pass('Post-logout refresh correctly rejected');
  } else {
    fail(`Expected 401 post-logout refresh, got ${postLogoutStatus}`);
  }

  await redis.quit();
  console.log('\n═══════════════════════════════════════');
  if (process.exitCode === 1) {
    console.log('  RESULT: Some tests FAILED ❌');
  } else {
    console.log('  RESULT: All tests PASSED ✅');
  }
  console.log('═══════════════════════════════════════\n');
  process.exit(process.exitCode ?? 0);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
