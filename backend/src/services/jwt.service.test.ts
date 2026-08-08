import { jwtService } from './jwt.service';

describe('jwtService', () => {
  const payload = { userId: 'user-1', phone: '+919999999999', societyId: 'soc-1', role: 'owner' };

  it('round-trips an access token', () => {
    const token = jwtService.signAccessToken(payload);
    const decoded = jwtService.verifyAccessToken(token);
    expect(decoded).toMatchObject(payload);
  });

  it('round-trips a refresh token', () => {
    const token = jwtService.signRefreshToken({ userId: 'user-1', tokenId: 'tok-1' });
    const decoded = jwtService.verifyRefreshToken(token);
    expect(decoded).toMatchObject({ userId: 'user-1', tokenId: 'tok-1' });
  });

  it('rejects a garbage token', () => {
    expect(jwtService.verifyAccessToken('not-a-real-token')).toBeNull();
  });

  it('signs and verifies a sensitive action token', () => {
    const token = jwtService.signSensitiveActionToken('user-1');
    const decoded = jwtService.verifySensitiveActionToken(token);
    expect(decoded).toMatchObject({ userId: 'user-1', type: 'sensitive_action' });
  });

  it('rejects a bogus sensitive action token', () => {
    expect(jwtService.verifySensitiveActionToken('bogus')).toBeNull();
  });

  it('rejects a plain access token presented as a sensitive action token', () => {
    // An access token is signed with the same key/algorithm, so an attacker who steals one
    // must not be able to replay it as a PIN-verified action token for a payments/admin route.
    const accessToken = jwtService.signAccessToken(payload);
    expect(jwtService.verifySensitiveActionToken(accessToken)).toBeNull();
  });
});
