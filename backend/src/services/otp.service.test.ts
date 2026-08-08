const redisMock = {
  incr: jest.fn(),
  expire: jest.fn(),
  setex: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

jest.mock('../config/redis', () => ({ redis: redisMock }));

const envMock = {
  isDev: true,
  otp: { expirySeconds: 600, provider: 'console', fast2smsApiKey: 'test-key', msg91AuthKey: '', msg91TemplateId: '' },
};
jest.mock('../config/env', () => ({ env: envMock }));

import { otpService } from './otp.service';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

describe('otpService', () => {
  const phone = '9999999999';

  describe('send — rate limiting', () => {
    it('allows sending while under the hourly limit', async () => {
      envMock.isDev = false;
      redisMock.incr.mockResolvedValueOnce(1);
      const result = await otpService.send(phone);
      expect(result.success).toBe(true);
      expect(redisMock.expire).toHaveBeenCalledWith(expect.stringContaining(phone), 3600);
    });

    it('blocks sending once the hourly limit (5/hr in prod) is exceeded', async () => {
      envMock.isDev = false;
      redisMock.incr.mockResolvedValueOnce(6);
      const result = await otpService.send(phone);
      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too many/i);
    });

    it('uses a much higher limit in dev so local testing is not blocked', async () => {
      envMock.isDev = true;
      envMock.otp.provider = 'console';
      redisMock.incr.mockResolvedValueOnce(6);
      const result = await otpService.send(phone);
      expect(result.success).toBe(true);
    });
  });

  describe('send — fast2sms provider', () => {
    afterEach(() => { envMock.otp.provider = 'console'; });

    it('calls the Fast2SMS API and succeeds on a successful response', async () => {
      envMock.otp.provider = 'fast2sms';
      redisMock.incr.mockResolvedValueOnce(1);
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ return: true }) });

      const result = await otpService.send(phone);

      expect(result.success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.fast2sms.com/dev/bulkV2',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ authorization: 'test-key' }),
        })
      );
    });

    it('reports failure without crashing when Fast2SMS rejects the request', async () => {
      envMock.otp.provider = 'fast2sms';
      redisMock.incr.mockResolvedValueOnce(1);
      fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ return: false, message: 'Invalid number' }) });

      const result = await otpService.send(phone);

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/OTP system error/i);
    });
  });

  describe('verify', () => {
    it('rejects when no OTP was ever sent', async () => {
      envMock.isDev = false;
      redisMock.get.mockResolvedValueOnce(null);
      expect(await otpService.verify(phone, '123456')).toBe(false);
    });

    it('rejects an incorrect OTP', async () => {
      envMock.isDev = false;
      redisMock.get.mockResolvedValueOnce('654321');
      expect(await otpService.verify(phone, '123456')).toBe(false);
    });

    it('accepts the correct OTP and deletes it (single-use)', async () => {
      envMock.isDev = false;
      redisMock.get.mockResolvedValueOnce('123456');
      expect(await otpService.verify(phone, '123456')).toBe(true);
      expect(redisMock.del).toHaveBeenCalled();
    });

    it('accepts the master OTP only in dev', async () => {
      envMock.isDev = true;
      expect(await otpService.verify(phone, '000000')).toBe(true);
      // Master OTP bypasses Redis entirely — must never touch the real stored code.
      expect(redisMock.get).not.toHaveBeenCalled();
    });

    it('rejects the master OTP in production', async () => {
      envMock.isDev = false;
      redisMock.get.mockResolvedValueOnce('123456');
      expect(await otpService.verify(phone, '000000')).toBe(false);
    });
  });
});
