/**
 * Push notification service — uses Expo Push Notification API.
 * Expo handles FCM (Android) and APNs (iOS) delivery automatically.
 */

interface ExpoPushMessage {
  to: string | string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function send(messages: ExpoPushMessage | ExpoPushMessage[]): Promise<void> {
  const batch = Array.isArray(messages) ? messages : [messages];
  const valid = batch.filter(m =>
    typeof m.to === 'string'
      ? m.to.startsWith('ExponentPushToken[')
      : (m.to as string[]).some(t => t.startsWith('ExponentPushToken['))
  );
  if (valid.length === 0) return;

  try {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
      body: JSON.stringify(valid),
    });
    if (!resp.ok) {
      console.error('[notify] Expo push API error:', resp.status, await resp.text());
      return;
    }
    const json = (await resp.json()) as { data: ExpoPushTicket[] };
    for (const ticket of json.data ?? []) {
      if (ticket.status === 'error') console.error('[notify] Push ticket error:', ticket.message, ticket.details);
    }
  } catch (err) {
    console.error('[notify] Failed to send push notification:', err);
  }
}

export const notificationService = {
  async newComplaint(opts: {
    committeeTokens: string[];
    flatNumber: string;
    societyName: string;
    complaintTitle: string;
    complaintId: string;
    priority: string;
  }) {
    const { committeeTokens, flatNumber, societyName, complaintTitle, complaintId, priority } = opts;
    if (!committeeTokens.length) return;
    await send({
      to: committeeTokens,
      title: `New ${priority.toUpperCase()} complaint — Flat ${flatNumber}`,
      body: complaintTitle,
      data: { screen: 'ComplaintDetail', complaintId },
      sound: 'default',
      priority: priority === 'critical' || priority === 'high' ? 'high' : 'default',
      channelId: 'complaints',
    });
  },

  async complaintStatusUpdate(opts: {
    residentToken: string;
    complaintTitle: string;
    complaintId: string;
    newStatus: string;
    resolutionNote?: string;
  }) {
    const { residentToken, complaintTitle, complaintId, newStatus, resolutionNote } = opts;
    if (!residentToken) return;
    const labels: Record<string, { title: string; body: string }> = {
      assigned: { title: 'Complaint assigned', body: `"${complaintTitle}" assigned to a technician.` },
      in_progress: { title: 'Work in progress', body: `Work started on: "${complaintTitle}"` },
      resolved: { title: 'Complaint resolved!', body: resolutionNote ?? `"${complaintTitle}" resolved. Please rate.` },
      closed: { title: 'Complaint closed', body: `"${complaintTitle}" has been closed.` },
      escalated: { title: 'Complaint escalated', body: `"${complaintTitle}" escalated for priority handling.` },
    };
    const msg = labels[newStatus];
    if (!msg) return;
    await send({
      to: residentToken,
      title: msg.title,
      body: msg.body,
      data: { screen: 'ComplaintTracker', complaintId },
      sound: 'default',
      priority: newStatus === 'escalated' ? 'high' : 'default',
      channelId: 'complaints',
    });
  },

  async newAnnouncement(opts: {
    tokens: string[];
    title: string;
    body: string;
    announcementId: string;
    priority: string;
  }) {
    const { tokens, title, body, announcementId, priority } = opts;
    if (!tokens.length) return;
    await send({
      to: tokens,
      title: priority === 'urgent' ? `URGENT: ${title}` : title,
      body,
      data: { screen: 'AnnouncementDetail', announcementId },
      sound: 'default',
      priority: priority === 'urgent' ? 'high' : 'default',
      channelId: 'announcements',
    });
  },

  async visitorArrival(opts: {
    residentTokens: string[];
    visitorName: string;
    visitorId: string;
    flatNumber: string;
    purpose: string;
    companyName?: string;
  }) {
    const { residentTokens, visitorName, visitorId, flatNumber, purpose, companyName } = opts;
    if (!residentTokens.length) return;
    const who = companyName ? `${visitorName} (${companyName})` : visitorName;
    await send({
      to: residentTokens,
      title: 'Visitor at the gate!',
      body: `${who} is here for Flat ${flatNumber}. Approve or Reject?`,
      data: { screen: 'VisitorApproval', visitorId },
      sound: 'default',
      priority: 'high',
      channelId: 'visitors',
    });
  },

  async paymentReceived(opts: {
    committeeTokens: string[];
    residentToken: string | undefined;
    flatNumber: string;
    amount: number;
    societyId: string;
  }) {
    const { committeeTokens, residentToken, flatNumber, amount } = opts;
    if (committeeTokens.length) {
      await send({
        to: committeeTokens,
        title: 'Payment received',
        body: `Flat ${flatNumber} paid ₹${amount.toLocaleString('en-IN')}`,
        data: { screen: 'PaymentCollection' },
        sound: 'default',
        channelId: 'payments',
      });
    }
    if (residentToken) {
      await send({
        to: residentToken,
        title: 'Payment successful',
        body: `₹${amount.toLocaleString('en-IN')} paid successfully. Receipt generated.`,
        data: { screen: 'PaymentHistory' },
        sound: 'default',
        channelId: 'payments',
      });
    }
  },

  async sosAlert(opts: {
    tokens: string[];
    flatNumber: string;
    residentName: string;
    message: string;
    alertId: string;
  }) {
    const { tokens, flatNumber, residentName, message, alertId } = opts;
    if (!tokens.length) return;
    await send({
      to: tokens,
      title: `EMERGENCY SOS — Flat ${flatNumber}`,
      body: `${residentName}: ${message}`,
      data: { screen: 'SosAlert', alertId },
      sound: 'default',
      priority: 'high',
      channelId: 'emergency',
    });
  },

  async sosResolved(opts: { token: string; alertId: string }) {
    await send({
      to: opts.token,
      title: 'SOS resolved',
      body: 'Your emergency alert has been resolved by the security team.',
      data: { screen: 'SosAlert', alertId: opts.alertId },
      sound: 'default',
      channelId: 'emergency',
    });
  },

  async sendToTokens(tokens: string[], title: string, body: string, data?: Record<string, unknown>) {
    if (!tokens.length) return;
    await send({ to: tokens, title, body, data, sound: 'default', priority: 'high', channelId: 'security' });
  },
};
