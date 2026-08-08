"use client";

import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { Users, Check, X, Shield, Search, RefreshCw, Upload, Download, FileSpreadsheet } from 'lucide-react';

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

interface BulkImportRowResult {
  row: number;
  flatNumber: string;
  phone: string;
  status: 'created' | 'already_member' | 'error';
  message?: string;
}

interface BulkImportSummary {
  total: number;
  created: number;
  alreadyMember: number;
  failed: number;
}

export default function MembersApprovalPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [societyId, setSocietyId] = useState('');
  const [error, setError] = useState('');

  // Bulk CSV import
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<BulkImportSummary | null>(null);
  const [importResults, setImportResults] = useState<BulkImportRowResult[]>([]);
  const [importError, setImportError] = useState('');

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

  const handleDownloadTemplate = () => {
    const template = 'flatNumber,name,phone,role\nA-101,Ramesh Kumar,9876543210,owner\nA-102,Priya Singh,9876543211,tenant\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'urban-hub-members-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !societyId) return;

    setImporting(true);
    setImportError('');
    setImportSummary(null);
    setImportResults([]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const data = await apiRequest(`/societies/${societyId}/members/bulk-import`, {
        method: 'POST',
        body: formData,
      });
      setImportSummary(data.summary);
      setImportResults(data.results || []);
      await fetchMembers(societyId); // refresh the approved list below
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImporting(false);
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

      {/* Bulk CSV Import */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <FileSpreadsheet className="header-icon text-indigo" />
          <h2>Bulk Import Members</h2>
        </div>
        <p className="import-hint">
          Onboarding a whole society at once? Upload a CSV of flat numbers, names, and phone
          numbers — everyone is pre-approved instantly. Residents just verify their phone number
          in the app to claim their spot, no waiting on individual approval.
        </p>
        <div className="import-actions">
          <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
            <Download size={16} />
            Download CSV Template
          </button>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <Upload size={16} />
            {importing ? 'Importing...' : 'Upload CSV'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleFileSelected}
          />
        </div>

        {importError && <div className="alert alert-error">{importError}</div>}

        {importSummary && (
          <div className="import-summary">
            <span className="summary-chip summary-total">{importSummary.total} rows</span>
            <span className="summary-chip summary-created">{importSummary.created} added</span>
            <span className="summary-chip summary-skipped">{importSummary.alreadyMember} already members</span>
            {importSummary.failed > 0 && (
              <span className="summary-chip summary-failed">{importSummary.failed} failed</span>
            )}
          </div>
        )}

        {importResults.some(r => r.status === 'error') && (
          <div className="import-errors">
            <p className="import-errors-title">Rows that couldn&apos;t be imported:</p>
            <ul>
              {importResults.filter(r => r.status === 'error').map(r => (
                <li key={r.row}>
                  Row {r.row} ({r.flatNumber || 'unknown flat'}): {r.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

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

        .import-hint {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 16px;
        }

        .import-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .import-summary {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 16px;
        }

        .summary-chip {
          font-size: 0.8rem;
          font-weight: 600;
          padding: 6px 12px;
          border-radius: 999px;
        }

        .summary-total {
          background: rgba(255, 255, 255, 0.04);
          color: var(--text-secondary);
        }

        .summary-created {
          background: rgba(16, 185, 129, 0.1);
          color: var(--status-success);
        }

        .summary-skipped {
          background: rgba(99, 102, 241, 0.1);
          color: #a5b4fc;
        }

        .summary-failed {
          background: rgba(239, 68, 68, 0.1);
          color: var(--status-error);
        }

        .import-errors {
          margin-top: 16px;
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.2);
          border-radius: 10px;
          padding: 14px 18px;
        }

        .import-errors-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--status-error);
          margin-bottom: 8px;
        }

        .import-errors ul {
          margin: 0;
          padding-left: 18px;
        }

        .import-errors li {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }
      `}</style>
    </div>
  );
}
