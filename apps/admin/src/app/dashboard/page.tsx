"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { 
  Users, MessageSquare, ShieldAlert, Sparkles, Building, 
  DoorOpen, Activity, AlertCircle, TrendingUp
} from 'lucide-react';

interface Stats {
  totalMembers: number;
  pendingMembers: number;
  openComplaints: number;
  activeSos: number;
  securityEvents24h: number;
  failedSecurityEvents24h: number;
}

export default function DashboardOverview() {
  const [stats, setStats] = useState<Stats>({
    totalMembers: 0,
    pendingMembers: 0,
    openComplaints: 0,
    activeSos: 0,
    securityEvents24h: 0,
    failedSecurityEvents24h: 0,
  });
  const [loading, setLoading] = useState(true);
  const [societyName, setSocietyName] = useState('');

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    setSocietyName(user.societyName);

    async function fetchDashboardData() {
      try {
        const [membersData, complaintsData, sosData, securityData] = await Promise.all([
          apiRequest(`/societies/${user.societyId}/members`),
          apiRequest(`/complaints?societyId=${user.societyId}`),
          apiRequest(`/sos?societyId=${user.societyId}`),
          apiRequest(`/security/summary?societyId=${user.societyId}`).catch(() => ({ summary: { totalEventsLast24h: 0, failedEventsLast24h: 0 } })),
        ]);

        const members = membersData.members || [];
        const complaints = complaintsData.complaints || [];
        const sosAlerts = sosData.alerts || [];

        setStats({
          totalMembers: members.filter((m: any) => m.status === 'approved').length,
          pendingMembers: members.filter((m: any) => m.status === 'pending').length,
          openComplaints: complaints.filter((c: any) => c.status !== 'resolved').length,
          activeSos: sosAlerts.filter((a: any) => a.status === 'active').length,
          securityEvents24h: securityData.summary?.totalEventsLast24h || 0,
          failedSecurityEvents24h: securityData.summary?.failedEventsLast24h || 0,
        });
      } catch (err) {
        console.error('Failed to load dashboard statistics', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const statCards = [
    { 
      title: 'Approved Residents', 
      value: stats.totalMembers, 
      desc: 'Active app memberships', 
      icon: Users, 
      color: '#6366f1' 
    },
    { 
      title: 'Pending Approval', 
      value: stats.pendingMembers, 
      desc: 'Requires review', 
      icon: AlertCircle, 
      color: '#f59e0b',
      highlight: stats.pendingMembers > 0 
    },
    { 
      title: 'Open Complaints', 
      value: stats.openComplaints, 
      desc: 'Awaiting resolution', 
      icon: MessageSquare, 
      color: '#ef4444' 
    },
    { 
      title: 'Active SOS Alerts', 
      value: stats.activeSos, 
      desc: 'Emergency signals', 
      icon: ShieldAlert, 
      color: stats.activeSos > 0 ? '#ef4444' : '#10b981',
      pulse: stats.activeSos > 0
    }
  ];

  return (
    <div className="overview-container fade-in">
      <header className="page-header">
        <div>
          <h1>Dashboard Overview</h1>
          <p className="subtitle">Real-time status metrics for {societyName}</p>
        </div>
      </header>

      {/* Grid Stats */}
      <section className="stats-grid">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div 
              key={i} 
              className={`stat-card glass-panel ${card.highlight ? 'warning-border' : ''} ${card.pulse ? 'pulse-shadow' : ''}`}
            >
              <div className="stat-icon-wrapper" style={{ background: `${card.color}15`, color: card.color }}>
                <Icon size={24} />
              </div>
              <div className="stat-info">
                <h3>{card.value}</h3>
                <p className="stat-title">{card.title}</p>
                <p className="stat-desc">{card.desc}</p>
              </div>
            </div>
          );
        })}
      </section>

      {/* Two Columns Section */}
      <div className="dashboard-grid">
        {/* Security Health Box */}
        <div className="glass-panel main-panel">
          <div className="panel-header">
            <Activity className="panel-icon text-indigo" />
            <h2>Security Logs & Audit Summary</h2>
          </div>
          <div className="security-summary-body">
            <div className="metric-box">
              <span className="metric-label">Access Requests (24h)</span>
              <span className="metric-val">{stats.securityEvents24h}</span>
            </div>
            <div className="metric-box">
              <span className="metric-label">Failed Auth Blocks (24h)</span>
              <span className={`metric-val ${stats.failedSecurityEvents24h > 0 ? 'text-red' : 'text-green'}`}>
                {stats.failedSecurityEvents24h}
              </span>
            </div>
            <div className="metric-box full">
              <span className="metric-label">System Performance status</span>
              <span className="badge badge-success">Healthy & Secure</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Panel */}
        <div className="glass-panel side-panel">
          <div className="panel-header">
            <TrendingUp className="panel-icon text-amber" />
            <h2>Quick Actions</h2>
          </div>
          <div className="quick-actions-list">
            <a href="/dashboard/members" className="action-btn">
              <span>Approve Pending Members</span>
              <span className="badge badge-warning">{stats.pendingMembers}</span>
            </a>
            <a href="/dashboard/complaints" className="action-btn">
              <span>Open Complaints Desk</span>
              <span className="badge badge-error">{stats.openComplaints}</span>
            </a>
            <a href="/dashboard/visitors" className="action-btn">
              <span>Gate Visitors Log</span>
              <span className="arrow">→</span>
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .overview-container {
          display: flex;
          flex-direction: column;
          gap: 30px;
        }

        .dashboard-loading {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .page-header {
          margin-bottom: 10px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
        }

        .stat-card {
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          border-radius: 20px;
        }

        .warning-border {
          border-color: rgba(245, 158, 11, 0.4);
        }

        .pulse-shadow {
          animation: pulseBorder 2s infinite;
        }

        .stat-icon-wrapper {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .stat-info h3 {
          font-size: 1.85rem;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .stat-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-secondary);
          margin: 4px 0 2px;
        }

        .stat-desc {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 20px;
        }

        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }

        .main-panel, .side-panel {
          padding: 24px;
          border-radius: 20px;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 24px;
          border-bottom: 1px solid var(--border-muted);
          padding-bottom: 16px;
        }

        .panel-header h2 {
          font-size: 1.15rem;
          color: var(--text-primary);
        }

        .panel-icon {
          color: var(--text-secondary);
        }

        .text-indigo { color: #818cf8; }
        .text-amber { color: #fbbf24; }

        .security-summary-body {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .metric-box {
          background: rgba(0, 0, 0, 0.2);
          border: 1px solid var(--border-muted);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .metric-box.full {
          grid-column: span 2;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
        }

        .metric-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .metric-val {
          font-size: 1.5rem;
          font-weight: 700;
          font-family: var(--font-display);
        }

        .text-red { color: #f87171; }
        .text-green { color: #34d399; }

        .quick-actions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .action-btn {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 18px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid var(--border-muted);
          border-radius: 12px;
          text-decoration: none;
          color: var(--text-primary);
          font-size: 0.9rem;
          font-family: var(--font-display);
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .action-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.15);
          transform: translateX(4px);
        }

        .arrow {
          font-size: 1.1rem;
          color: var(--text-secondary);
        }
      `}</style>
    </div>
  );
}
