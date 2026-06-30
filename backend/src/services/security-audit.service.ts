/**
 * SecurityAuditService — fire-and-forget append-only audit logging.
 *
 * The underlying table is protected by a DB trigger that prevents UPDATE/DELETE,
 * so these logs are immutable once written.
 *
 * Usage: SecurityAuditService.log({ ... })  — never await, never block a request
 *
 * Anomaly detection runs automatically on every login event and emits a push
 * notification to the user's other devices when a suspicious pattern is found.
 */

import { prisma } from '../config/db';
import { notificationService } from './notification.service';

export interface AuditEvent {
  userId?: string;
  societyId?: string;
  action: string;          // e.g. "auth.login", "complaint.update", "visitor.approve"
  resource?: string;       // e.g. "complaint", "visitor"
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  country?: string;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

export const SecurityAuditService = {
  /**
   * Append an audit event. Fire-and-forget — never throws, never blocks.
   */
  log(event: AuditEvent): void {
    prisma.securityAuditLog.create({
      data: {
        userId:     event.userId     ?? null,
        societyId:  event.societyId  ?? null,
        action:     event.action,
        resource:   event.resource   ?? null,
        resourceId: event.resourceId ?? null,
        ipAddress:  event.ipAddress  ?? null,
        userAgent:  event.userAgent  ?? null,
        country:    event.country    ?? null,
        success:    event.success    ?? true,
        metadata:   (event.metadata  ?? null) as any,
      },
    }).catch((err) => {
      console.error('[SecurityAuditService] Failed to write audit log:', err);
    });

    // Anomaly detection runs in the background for auth events
    if (event.action.startsWith('auth.') && event.userId) {
      this._detectAnomalies(event).catch(() => {});
    }
  },

  /**
   * Extract client IP from request, preferring X-Forwarded-For (behind reverse proxy).
   */
  extractIp(req: import('express').Request): string | undefined {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
    }
    return req.socket?.remoteAddress;
  },

  // ─── Anomaly detection (internal) ──────────────────────────────────────────

  async _detectAnomalies(event: AuditEvent): Promise<void> {
    if (!event.userId) return;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [recentIps, historicalCountries] = await Promise.all([
      // Distinct IPs used in the last hour
      prisma.securityAuditLog.findMany({
        where: {
          userId:    event.userId,
          action:    { startsWith: 'auth.' },
          createdAt: { gte: oneHourAgo },
          ipAddress: { not: null },
        },
        select: { ipAddress: true },
        distinct: ['ipAddress'],
      }),
      // Countries seen in the last 30 days (trusted history)
      prisma.securityAuditLog.findMany({
        where: {
          userId:    event.userId,
          action:    { startsWith: 'auth.' },
          createdAt: { gte: thirtyDaysAgo },
          country:   { not: null },
          success:   true,
        },
        select: { country: true },
        distinct: ['country'],
      }),
    ]);

    const anomalies: string[] = [];

    // > 3 distinct IPs in one hour — possible account takeover
    if (recentIps.length > 3) {
      anomalies.push(`Login from ${recentIps.length} different IPs in the last hour`);
    }

    // Login from a country never seen before
    if (event.country && historicalCountries.length > 0) {
      const knownCountries = new Set(historicalCountries.map(r => r.country));
      if (!knownCountries.has(event.country)) {
        anomalies.push(`First login from ${event.country}`);
      }
    }

    // Unusual hour check (before 5AM or after 11PM IST = UTC+5:30)
    const nowUtc = new Date();
    const istHour = (nowUtc.getUTCHours() + 5 + Math.floor((nowUtc.getUTCMinutes() + 30) / 60)) % 24;
    if (istHour < 5 || istHour >= 23) {
      anomalies.push(`Login at unusual hour (${istHour}:00 IST)`);
    }

    if (anomalies.length === 0) return;

    // Alert the user's other devices
    const user = await prisma.user.findUnique({
      where: { id: event.userId },
      select: { expoPushToken: true, name: true },
    });
    if (!user?.expoPushToken) return;

    notificationService.sendToTokens(
      [user.expoPushToken],
      'Security Alert',
      `Unusual activity detected: ${anomalies[0]}. If this wasn't you, change your PIN immediately.`,
      { type: 'security_alert', anomalies },
    ).catch(() => {});
  },
};
