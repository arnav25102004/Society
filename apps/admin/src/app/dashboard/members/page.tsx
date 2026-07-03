"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { Users, Check, X, Shield, Search, RefreshCw } from 'lucide-react';

interface Member {
  id: string;
  userId: string;
  societyId: string;
  flatNumber: string;
  role: string;
  status: string;
  joinedAt: string;
  user: {
    id: string;
    name: string;
    phone: string;
    avatarUrl: string | null;
  };
}

export default function MembersApprovalPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [societyId, setSocietyId] = useState('');
  const [error, setError] = useState('');

  const fetchMembers = async (sId: string) => {
    try {
      setLoading(true);
      const data = await apiRequest(`/societies/${sId}/members`);
      setMembers(data.members || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch members');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    setSocietyId(user.societyId);
    fetchMembers(user.societyId);
  }, []);

  const handleApprove = async (memberId: string) => {
    setActioningId(memberId);
    setError('');
    try {
      await apiRequest(`/societies/${societyId}/members/${memberId}/approve`, {
        method: 'PUT',
      });
      // Update local state
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'approved' } : m));
    } catch (err: any) {
      setError(err.message || 'Failed to approve member');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (memberId: string) => {
    setActioningId(memberId);
    setError('');
    try {
      await apiRequest(`/societies/${societyId}/members/${memberId}/reject`, {
        method: 'PUT',
      });
      // Update local state
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'rejected' } : m));
    } catch (err: any) {
      setError(err.message || 'Failed to reject member');
    } finally {
      setActioningId(null);
    }
  };

  const pendingMembers = members.filter(m => m.status === 'pending');
  const approvedMembers = members.filter(m => m.status === 'approved');

  const filterMembers = (list: Member[]) => {
    if (!searchQuery) return list;
    const query = searchQuery.toLowerCase();
    return list.filter(m => 
      m.user.name?.toLowerCase().includes(query) ||
      m.flatNumber?.toLowerCase().includes(query) ||
      m.user.phone?.includes(query)
    );
  };

  const filteredPending = filterMembers(pendingMembers);
  const filteredApproved = filterMembers(approvedMembers);

  return (
    <div className="members-container fade-in">
      <header className="page-header">
        <div>
          <h1>Residents Approval Desk</h1>
          <p className="subtitle">Approve or reject resident membership requests for your society</p>
        </div>
        <button className="btn btn-secondary" onClick={() => fetchMembers(societyId)}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats row */}
      <section className="stats-row">
        <div className="mini-card glass-panel">
          <span className="card-label">Pending Requests</span>
          <span className={`card-val ${pendingMembers.length > 0 ? 'text-amber' : ''}`}>
            {pendingMembers.length}
          </span>
        </div>
        <div className="mini-card glass-panel">
          <span className="card-label">Total Approved</span>
          <span className="card-val text-green">{approvedMembers.length}</span>
        </div>
      </section>

      {/* Search Input */}
      <div className="search-bar-wrapper glass-panel">
        <Search size={18} className="search-icon" />
        <input 
          type="text" 
          placeholder="Search by name, flat number, or phone..." 
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Pending Requests Panel */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <Users className="header-icon text-amber" />
          <h2>Pending Membership Requests ({filteredPending.length})</h2>
        </div>
        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : filteredPending.length === 0 ? (
          <div className="empty-state">No pending requests found</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Flat No.</th>
                  <th>Phone Number</th>
                  <th>Role Requested</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPending.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="user-info-td">
                        <div className="td-avatar">{member.user.name?.[0] || 'R'}</div>
                        <span>{member.user.name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td><span className="flat-badge">{member.flatNumber}</span></td>
                    <td>{member.user.phone}</td>
                    <td>
                      <span className="role-tag">
                        <Shield size={12} />
                        {member.role}
                      </span>
                    </td>
                    <td>
                      <div className="action-buttons-group">
                        <button 
                          className="btn-action btn-action-success"
                          disabled={actioningId !== null}
                          onClick={() => handleApprove(member.id)}
                          title="Approve Membership"
                        >
                          <Check size={16} />
                        </button>
                        <button 
                          className="btn-action btn-action-danger"
                          disabled={actioningId !== null}
                          onClick={() => handleReject(member.id)}
                          title="Reject Membership"
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

      {/* Approved Residents Panel */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <Users className="header-icon text-indigo" />
          <h2>Approved Society Residents ({filteredApproved.length})</h2>
        </div>
        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : filteredApproved.length === 0 ? (
          <div className="empty-state">No approved members found</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Flat No.</th>
                  <th>Phone Number</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredApproved.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="user-info-td">
                        <div className="td-avatar bg-indigo">{member.user.name?.[0] || 'R'}</div>
                        <span>{member.user.name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td><span className="flat-badge">{member.flatNumber}</span></td>
                    <td>{member.user.phone}</td>
                    <td>
                      <span className="role-tag approved">
                        <Shield size={12} />
                        {member.role}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-success">Approved</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .members-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .stats-row {
          display: flex;
          gap: 20px;
        }

        .mini-card {
          flex: 1;
          padding: 16px 20px;
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .card-label {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .card-val {
          font-size: 1.6rem;
          font-weight: 700;
          font-family: var(--font-display);
        }

        .text-amber { color: #f59e0b; }
        .text-green { color: #10b981; }
        .text-indigo { color: #818cf8; }

        .search-bar-wrapper {
          display: flex;
          align-items: center;
          padding: 12px 18px;
          border-radius: 12px;
          gap: 12px;
        }

        .search-icon {
          color: var(--text-muted);
        }

        .search-input {
          background: transparent;
          border: none;
          outline: none;
          color: var(--text-primary);
          width: 100%;
          font-size: 0.95rem;
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
          color: #fff;
        }

        .flat-badge {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-muted);
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
        }

        .role-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 0.8rem;
          color: #fca5a5;
          background: rgba(239, 68, 68, 0.08);
          padding: 4px 8px;
          border-radius: 6px;
          text-transform: capitalize;
        }

        .role-tag.approved {
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.08);
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
