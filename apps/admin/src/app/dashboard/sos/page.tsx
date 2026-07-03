"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { ShieldAlert, Check, RefreshCw, AlertTriangle, Phone } from 'lucide-react';

interface Alert {
  id: string;
  societyId: string;
  userId: string;
  flatNumber: string;
  message: string | null;
  status: 'active' | 'resolved';
  createdAt: string;
  resolvedAt: string | null;
  raisedBy: {
    name: string;
    phone: string;
  };
  respondedBy?: {
    name: string;
  } | null;
}

export default function SosAlertsPage() {
  const [activeAlerts, setActiveAlerts] = useState<Alert[]>([]);
  const [resolvedAlerts, setResolvedAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [societyId, setSocietyId] = useState('');
  const [error, setError] = useState('');

  const fetchAlerts = async (sId: string) => {
    try {
      setLoading(true);
      const [activeData, resolvedData] = await Promise.all([
        apiRequest(`/sos?societyId=${sId}&status=active`),
        apiRequest(`/sos?societyId=${sId}&status=resolved`),
      ]);
      setActiveAlerts(activeData.alerts || []);
      setResolvedAlerts(resolvedData.alerts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load SOS alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    setSocietyId(user.societyId);
    fetchAlerts(user.societyId);

    // Set up auto-refresh every 10 seconds for SOS page
    const interval = setInterval(() => {
      fetchAlerts(user.societyId);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const handleResolve = async (alertId: string) => {
    setResolvingId(alertId);
    setError('');
    try {
      await apiRequest(`/sos/${alertId}/resolve`, {
        method: 'PUT',
      });
      // Refresh list
      await fetchAlerts(societyId);
    } catch (err: any) {
      setError(err.message || 'Failed to resolve SOS alert');
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <div className="sos-container fade-in">
      <header className="page-header">
        <div>
          <h1>SOS Emergency Hub</h1>
          <p className="subtitle">Monitor and respond to active emergency triggers from residents</p>
        </div>
        <button className="btn btn-secondary" onClick={() => fetchAlerts(societyId)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Main warning card if active alerts exist */}
      {activeAlerts.length > 0 && (
        <div className="emergency-banner">
          <AlertTriangle className="warning-icon-flash" size={32} />
          <div>
            <h3>ACTIVE EMERGENCY ALERTS TRIGGERED</h3>
            <p>Immediate action is required. Please check flat details and contact emergency services if needed.</p>
          </div>
        </div>
      )}

      {/* Active Alerts section */}
      <div className="panel-container glass-panel red-glow">
        <div className="panel-header text-red">
          <ShieldAlert className="header-icon" />
          <h2>Active Emergency Signals ({activeAlerts.length})</h2>
        </div>
        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : activeAlerts.length === 0 ? (
          <div className="empty-state">No active emergency signals. Systems secure.</div>
        ) : (
          <div className="alerts-list">
            {activeAlerts.map(alert => (
              <div key={alert.id} className="alert-card glass-panel active-alert">
                <div className="alert-card-header">
                  <div className="raised-by-info">
                    <h4>Flat {alert.flatNumber} — {alert.raisedBy.name}</h4>
                    <a href={`tel:${alert.raisedBy.phone}`} className="phone-link">
                      <Phone size={14} />
                      {alert.raisedBy.phone}
                    </a>
                  </div>
                  <span className="badge badge-error animate-pulse">Emergency Active</span>
                </div>
                <div className="alert-card-body">
                  <p className="alert-message">
                    "{alert.message || 'Emergency! Immediate assistance required.'}"
                  </p>
                  <p className="alert-time">
                    Triggered at: {new Date(alert.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="alert-card-actions">
                  <button 
                    className="btn btn-primary"
                    disabled={resolvingId !== null}
                    onClick={() => handleResolve(alert.id)}
                  >
                    <Check size={16} />
                    Mark Resolved
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved Alerts Logs */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <Check className="header-icon text-green" />
          <h2>Resolved Incident Logs ({resolvedAlerts.length})</h2>
        </div>
        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : resolvedAlerts.length === 0 ? (
          <div className="empty-state">No resolved incident history.</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Resident / Flat</th>
                  <th>Incident Msg</th>
                  <th>Triggered Time</th>
                  <th>Resolved By</th>
                  <th>Resolved Time</th>
                </tr>
              </thead>
              <tbody>
                {resolvedAlerts.map(alert => (
                  <tr key={alert.id}>
                    <td>
                      <div>
                        <strong>{alert.raisedBy.name}</strong>
                        <div className="text-secondary font-sm">Flat {alert.flatNumber}</div>
                      </div>
                    </td>
                    <td className="msg-cell">"{alert.message || 'Immediate assistance request'}"</td>
                    <td>{new Date(alert.createdAt).toLocaleString()}</td>
                    <td>
                      <span className="badge badge-info">{alert.respondedBy?.name || 'Staff'}</span>
                    </td>
                    <td>{alert.resolvedAt ? new Date(alert.resolvedAt).toLocaleString() : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .sos-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .emergency-banner {
          display: flex;
          align-items: center;
          gap: 20px;
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.4);
          padding: 20px;
          border-radius: 16px;
          color: #fca5a5;
        }

        .warning-icon-flash {
          color: var(--status-error);
          animation: flash 1s infinite alternate;
        }

        @keyframes flash {
          from { opacity: 0.4; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1.05); }
        }

        .red-glow {
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.05);
        }

        .panel-container {
          padding: 24px;
          border-radius: 16px;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
          border-bottom: 1px solid var(--border-muted);
          padding-bottom: 14px;
        }

        .panel-header.text-red h2, .panel-header.text-red .header-icon {
          color: #f87171;
        }

        .panel-header h2 {
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .header-icon {
          color: var(--text-secondary);
        }

        .loader-box {
          display: flex;
          justify-content: center;
          padding: 40px;
        }

        .empty-state {
          text-align: center;
          color: var(--text-muted);
          padding: 40px;
          font-size: 0.9rem;
        }

        .alerts-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .alert-card {
          padding: 20px;
          border-radius: 12px;
          background: rgba(239, 68, 68, 0.04);
          border: 1px solid rgba(239, 68, 68, 0.25);
        }

        .alert-card-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 12px;
        }

        .raised-by-info h4 {
          font-size: 1.05rem;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .phone-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-secondary);
          text-decoration: none;
          font-size: 0.85rem;
        }

        .phone-link:hover {
          color: var(--text-primary);
          text-decoration: underline;
        }

        .alert-message {
          font-size: 1rem;
          color: var(--text-primary);
          background: rgba(0, 0, 0, 0.2);
          padding: 12px;
          border-radius: 8px;
          margin: 8px 0;
          border-left: 3px solid var(--status-error);
        }

        .alert-time {
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .alert-card-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 15px;
        }

        .font-sm {
          font-size: 0.8rem;
        }

        .msg-cell {
          font-style: italic;
          color: var(--text-secondary);
        }

        .animate-pulse {
          animation: pulse 1.5s infinite alternate;
        }

        @keyframes pulse {
          from { opacity: 0.7; }
          to { opacity: 1; box-shadow: 0 0 8px var(--status-error); }
        }
      `}</style>
    </div>
  );
}
