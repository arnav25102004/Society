"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { DoorOpen, Check, X, RefreshCw, Clock, ShieldCheck, User } from 'lucide-react';

interface Visitor {
  id: string;
  societyId: string;
  flatNumber: string;
  visitorName: string;
  visitorPhone: string | null;
  companyName: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'pre_approved';
  entryTime: string | null;
  exitTime: string | null;
  createdAt: string;
  approvedBy?: {
    name: string;
  } | null;
}

export default function GateVisitorsPage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [societyId, setSocietyId] = useState('');
  const [error, setError] = useState('');

  const fetchVisitors = async (sId: string) => {
    try {
      setLoading(true);
      const data = await apiRequest(`/visitors?societyId=${sId}`);
      setVisitors(data.visitors || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load visitors log');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    setSocietyId(user.societyId);
    fetchVisitors(user.societyId);
  }, []);

  const handleApprove = async (visitorId: string) => {
    setActioningId(visitorId);
    setError('');
    try {
      await apiRequest(`/visitors/${visitorId}/approve`, {
        method: 'PUT',
      });
      // Refresh list
      await fetchVisitors(societyId);
    } catch (err: any) {
      setError(err.message || 'Failed to approve visitor');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (visitorId: string) => {
    setActioningId(visitorId);
    setError('');
    try {
      await apiRequest(`/visitors/${visitorId}/reject`, {
        method: 'PUT', // Let's check: POST /visitors/:id/approve or reject
      });
      // Refresh list
      await fetchVisitors(societyId);
    } catch (err: any) {
      setError(err.message || 'Failed to reject visitor');
    } finally {
      setActioningId(null);
    }
  };

  const pendingEntries = visitors.filter(v => v.status === 'pending');
  const pastEntries = visitors.filter(v => v.status !== 'pending');

  return (
    <div className="visitors-container fade-in">
      <header className="page-header">
        <div>
          <h1>Gate Visitors log</h1>
          <p className="subtitle">Track active guest clearances and gate entry approvals</p>
        </div>
        <button className="btn btn-secondary" onClick={() => fetchVisitors(societyId)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Pending Visitors Section */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <Clock className="header-icon text-amber" />
          <h2>Awaiting Gate Clearance ({pendingEntries.length})</h2>
        </div>
        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : pendingEntries.length === 0 ? (
          <div className="empty-state">No visitors waiting at the gate.</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Visitor Name</th>
                  <th>Flat Target</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Arrival Time</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingEntries.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div className="user-info-td">
                        <div className="td-avatar"><User size={14} /></div>
                        <span>{v.visitorName}</span>
                      </div>
                    </td>
                    <td><span className="flat-badge">Flat {v.flatNumber}</span></td>
                    <td>{v.companyName || 'Personal'}</td>
                    <td>{v.visitorPhone || 'N/A'}</td>
                    <td>{new Date(v.createdAt).toLocaleTimeString()}</td>
                    <td>
                      <div className="action-buttons-group">
                        <button 
                          className="btn-action btn-action-success"
                          disabled={actioningId !== null}
                          onClick={() => handleApprove(v.id)}
                          title="Approve Entry"
                        >
                          <Check size={16} />
                        </button>
                        <button 
                          className="btn-action btn-action-danger"
                          disabled={actioningId !== null}
                          onClick={() => handleReject(v.id)}
                          title="Deny Entry"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Past Visitors Section */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <ShieldCheck className="header-icon text-indigo" />
          <h2>Historical Gate Logs ({pastEntries.length})</h2>
        </div>
        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : pastEntries.length === 0 ? (
          <div className="empty-state">No historical gate records.</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Visitor Name</th>
                  <th>Flat Target</th>
                  <th>Company</th>
                  <th>Log Status</th>
                  <th>Logged Date</th>
                  <th>Cleared By</th>
                </tr>
              </thead>
              <tbody>
                {pastEntries.map(v => (
                  <tr key={v.id}>
                    <td>
                      <div className="user-info-td">
                        <div className="td-avatar bg-indigo"><User size={14} className="text-white" /></div>
                        <span>{v.visitorName}</span>
                      </div>
                    </td>
                    <td><span className="flat-badge">Flat {v.flatNumber}</span></td>
                    <td>{v.companyName || 'Personal'}</td>
                    <td>
                      <span className={`badge ${
                        v.status === 'approved' || v.status === 'pre_approved' ? 'badge-success' : 'badge-error'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td>{new Date(v.createdAt).toLocaleDateString()} {new Date(v.createdAt).toLocaleTimeString()}</td>
                    <td>{v.approvedBy?.name || 'Pre-Approved'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .visitors-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .user-info-td {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .td-avatar {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.05);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
          border: 1px solid var(--border-muted);
        }

        .td-avatar.bg-indigo {
          background: var(--accent-admin-gradient);
          border: none;
        }

        .flat-badge {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-muted);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .action-buttons-group {
          display: flex;
          gap: 8px;
        }

        .btn-action {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 1px solid transparent;
          transition: all 0.2s;
        }

        .btn-action-success {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.2);
          color: var(--status-success);
        }

        .btn-action-success:hover {
          background: var(--status-success);
          color: #fff;
        }

        .btn-action-danger {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
          color: var(--status-error);
        }

        .btn-action-danger:hover {
          background: var(--status-error);
          color: #fff;
        }
      `}</style>
    </div>
  );
}
