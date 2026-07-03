"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { Building, Users, AlertTriangle, ShieldAlert, Check, RefreshCw } from 'lucide-react';

interface Stats {
  totalSocieties: number;
  totalUsers: number;
  totalMembers: number;
  pendingMembers: number;
  totalComplaints: number;
  activeAlerts: number;
}

export default function SuperAdminOverview() {
  const [stats, setStats] = useState<Stats>({
    totalSocieties: 0,
    totalUsers: 0,
    totalMembers: 0,
    pendingMembers: 0,
    totalComplaints: 0,
    activeAlerts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/super-admin/stats');
      setStats(data.stats || {});
    } catch (err: any) {
      setError(err.message || 'Failed to load platform stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const cards = [
    { title: 'Registered Societies', value: stats.totalSocieties, desc: 'Active housing societies', icon: Building, color: '#6366f1' },
    { title: 'Platform Users', value: stats.totalUsers, desc: 'Registered system accounts', icon: Users, color: '#f59e0b' },
    { title: 'Total Memberships', value: stats.totalMembers, desc: 'Approved society residents', icon: Check, color: '#10b981' },
    { title: 'Awaiting Approvals', value: stats.pendingMembers, desc: 'Pending admin reviews', icon: AlertTriangle, color: '#fbbf24', highlight: stats.pendingMembers > 0 },
    { title: 'Platform Complaints', value: stats.totalComplaints, desc: 'Filed issues platform-wide', icon: Users, color: '#ef4444' },
    { title: 'Active Emergency Alert Signals', value: stats.activeAlerts, desc: 'SOS incidents active', icon: ShieldAlert, color: '#f43f5e', pulse: stats.activeAlerts > 0 },
  ];

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="super-overview-container fade-in">
      <header className="page-header">
        <div>
          <h1>Platform Overview Dashboard</h1>
          <p className="subtitle">Platform HQ global statistics and operations health metrics</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchStats}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <section className="stats-grid">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <div 
              key={i} 
              className={`stat-card glass-panel border-super-hover ${card.highlight ? 'warning-border' : ''} ${card.pulse ? 'pulse-shadow-super' : ''}`}
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

      <style jsx>{`
        .super-overview-container {
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
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }

        .stat-card {
          padding: 24px;
          display: flex;
          align-items: center;
          gap: 20px;
          border-radius: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .border-super-hover:hover {
          border-color: rgba(245, 158, 11, 0.35) !important;
        }

        .warning-border {
          border-color: rgba(245, 158, 11, 0.4);
        }

        .pulse-shadow-super {
          animation: pulseBorderSuper 2s infinite;
        }

        @keyframes pulseBorderSuper {
          0% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0.4); }
          70% { box-shadow: 0 0 0 8px rgba(244, 63, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(244, 63, 94, 0); }
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
      `}</style>
    </div>
  );
}
