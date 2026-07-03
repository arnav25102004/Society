"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { Building, Users, Search, RefreshCw, Eye, Check, X, Shield } from 'lucide-react';

interface Society {
  id: string;
  name: string;
  societyCode: string;
  city: string;
  state: string;
  createdAt: string;
  _count: {
    members: number;
  };
}

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

export default function SocietiesRegistryPage() {
  const [societies, setSocieties] = useState<Society[]>([]);
  const [selectedSociety, setSelectedSociety] = useState<Society | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fetchSocieties = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/super-admin/societies');
      setSocieties(data.societies || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch societies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSocieties();
  }, []);

  const handleSelectSociety = async (society: Society) => {
    setSelectedSociety(society);
    setLoadingMembers(true);
    setError('');
    try {
      const data = await apiRequest(`/super-admin/societies/${society.id}/members`);
      setMembers(data.members || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load society members');
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleApprove = async (memberId: string) => {
    if (!selectedSociety) return;
    setActioningId(memberId);
    setError('');
    try {
      await apiRequest(`/super-admin/societies/${selectedSociety.id}/members/${memberId}/approve`, {
        method: 'PUT',
      });
      // Update locally
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'approved' } : m));
    } catch (err: any) {
      setError(err.message || 'Failed to approve member');
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (memberId: string) => {
    if (!selectedSociety) return;
    setActioningId(memberId);
    setError('');
    try {
      await apiRequest(`/super-admin/societies/${selectedSociety.id}/members/${memberId}/reject`, {
        method: 'PUT',
      });
      // Update locally
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, status: 'rejected' } : m));
    } catch (err: any) {
      setError(err.message || 'Failed to reject member');
    } finally {
      setActioningId(null);
    }
  };

  const filteredSocieties = societies.filter(s =>
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.societyCode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.city?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="societies-container fade-in">
      <header className="page-header">
        <div>
          <h1>Societies Registry</h1>
          <p className="subtitle">Audit and manage all housing societies configured on the platform</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchSocieties}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="search-bar-wrapper glass-panel">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search by name, location, code..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="societies-layout">
        {/* Left List of Societies */}
        <div className="panel-container glass-panel list-side">
          <div className="panel-header">
            <Building className="header-icon text-indigo" />
            <h2>Societies Directory ({filteredSocieties.length})</h2>
          </div>

          {loading ? (
            <div className="loader-box"><div className="spinner"></div></div>
          ) : filteredSocieties.length === 0 ? (
            <div className="empty-state">No societies registered yet.</div>
          ) : (
            <div className="societies-list">
              {filteredSocieties.map(society => (
                <div
                  key={society.id}
                  className={`society-item glass-panel ${selectedSociety?.id === society.id ? 'active-border' : ''}`}
                  onClick={() => handleSelectSociety(society)}
                >
                  <div className="society-item-meta">
                    <h4>{society.name}</h4>
                    <p className="society-location">{society.city}, {society.state}</p>
                    <p className="society-code">Code: <code>{society.societyCode}</code></p>
                  </div>
                  <div className="society-item-badge">
                    <span className="badge badge-info">{society._count?.members || 0} Residents</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Members side */}
        <div className="panel-container glass-panel detail-side">
          {selectedSociety ? (
            <>
              <div className="panel-header flex-between">
                <div className="header-meta">
                  <Users className="header-icon text-amber" />
                  <h2>Residents Audit: {selectedSociety.name}</h2>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedSociety(null)}>
                  Close
                </button>
              </div>

              {loadingMembers ? (
                <div className="loader-box"><div className="spinner"></div></div>
              ) : members.length === 0 ? (
                <div className="empty-state">No members registered in this society yet.</div>
              ) : (
                <div className="table-container">
                  <table className="app-table">
                    <thead>
                      <tr>
                        <th>Resident</th>
                        <th>Flat</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(member => (
                        <tr key={member.id}>
                          <td>
                            <div className="user-info-td">
                              <div className="td-avatar">{member.user?.name?.[0] || 'R'}</div>
                              <div>
                                <p className="font-bold">{member.user?.name}</p>
                                <p className="text-secondary font-sm">{member.user?.phone}</p>
                              </div>
                            </div>
                          </td>
                          <td><span className="flat-badge">{member.flatNumber}</span></td>
                          <td>
                            <span className="role-tag">
                              <Shield size={12} />
                              {member.role}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${member.status === 'approved' ? 'badge-success' : member.status === 'pending' ? 'badge-warning' : 'badge-error'}`}>
                              {member.status}
                            </span>
                          </td>
                          <td>
                            {member.status === 'pending' ? (
                              <div className="action-buttons-group">
                                <button
                                  className="btn-action btn-action-success"
                                  disabled={actioningId !== null}
                                  onClick={() => handleApprove(member.id)}
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  className="btn-action btn-action-danger"
                                  disabled={actioningId !== null}
                                  onClick={() => handleReject(member.id)}
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ) : (
                              <span className="text-muted font-sm">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state-large">
              <Building size={48} className="text-muted" />
              <h3>No Society Selected</h3>
              <p>Select a society from the directory list on the left to audit its registered residents and status.</p>
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        .societies-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

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

        .societies-layout {
          display: grid;
          grid-template-columns: 1fr 1.5fr;
          gap: 20px;
          align-items: start;
        }

        @media (max-width: 900px) {
          .societies-layout {
            grid-template-columns: 1fr;
          }
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

        .panel-header.flex-between {
          justify-content: space-between;
        }

        .header-meta {
          display: flex;
          align-items: center;
          gap: 12px;
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

        .empty-state-large {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 80px 40px;
          gap: 12px;
          text-align: center;
          color: var(--text-secondary);
        }

        .empty-state-large h3 {
          color: var(--text-primary);
        }

        .societies-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-height: 500px;
          overflow-y: auto;
        }

        .society-item {
          padding: 16px;
          border-radius: 12px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          transition: all 0.2s;
        }

        .society-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .active-border {
          border-color: var(--accent-super) !important;
          box-shadow: 0 0 10px rgba(245, 158, 11, 0.1);
        }

        .society-item-meta h4 {
          font-size: 0.95rem;
          color: var(--text-primary);
        }

        .society-location {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .society-code {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin-top: 4px;
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
          color: #a5b4fc;
          background: rgba(99, 102, 241, 0.08);
          padding: 4px 8px;
          border-radius: 6px;
          text-transform: capitalize;
        }

        .action-buttons-group {
          display: flex;
          gap: 8px;
        }

        .btn-action {
          width: 30px;
          height: 30px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 1px solid transparent;
        }

        .btn-action-success {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.2);
          color: var(--status-success);
        }

        .btn-action-danger {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
          color: var(--status-error);
        }
      `}</style>
    </div>
  );
}
