// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface Membership {
  id: string;
  societyId: string;
  societyName: string;
  societyCity: string;
  flatNumber: string;
  role: MemberRole;
  status: MemberStatus;
}

export type MemberRole = 'owner' | 'tenant' | 'committee' | 'guard' | 'admin';
export type MemberStatus = 'pending' | 'approved' | 'rejected';

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

// ─── Society ──────────────────────────────────────────────────────────────────

export interface Society {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  totalFlats: number;
  societyCode: string;
  logoUrl?: string;
  _count?: { members: number };
}

// ─── Navigation ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Phone: undefined;
  OTP: { phone: string; verificationId: string };
  SocietySelect: undefined;
  ProfileSetup: { societyCode?: string };
  PendingApproval: { societyName: string; flatNumber: string };
};

export type AppTabParamList = {
  Home: undefined;
  Tickets: undefined;
  Gate: undefined;
  Pay: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Auth: undefined;
  App: undefined;
};
