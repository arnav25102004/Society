"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { MessageSquare, AlertCircle, Check, Clock, User, ShieldAlert, Sparkles, Filter } from 'lucide-react';

interface Member {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
  };
}

interface Complaint {
  id: string;
  societyId: string;
  raisedById: string;
  flatNumber: string;
  title: string;
  description: string | null;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  createdAt: string;
  updatedAt: string;
  raisedBy: {
    name: string;
    phone: string;
  };
  assignedTo?: {
    name: string;
  } | null;
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [societyId, setSocietyId] = useState('');
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  // Modal state for resolving/assigning
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [newStatus, setNewStatus] = useState<Complaint['status']>('assigned');
  const [assignedToId, setAssignedToId] = useState<string>('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const fetchData = async (sId: string) => {
    try {
      setLoading(true);
      const [complaintsData, membersData] = await Promise.all([
        apiRequest(`/complaints?societyId=${sId}`),
        apiRequest(`/societies/${sId}/members`),
      ]);
      setComplaints(complaintsData.complaints || []);
      setMembers(membersData.members?.filter((m: any) => m.status === 'approved') || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load complaints data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    setSocietyId(user.societyId);
    fetchData(user.societyId);
  }, []);

  const handleOpenUpdateModal = (complaint: Complaint) => {
    setSelectedComplaint(complaint);
    setNewStatus(complaint.status);
    setAssignedToId(complaint.raisedById); // Default assignment
    setResolutionNote('');
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint) return;
    setUpdating(true);
    setError('');
    try {
      await apiRequest(`/complaints/${selectedComplaint.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus,
          assignedToId: assignedToId || undefined,
          resolutionNote: resolutionNote || undefined,
        }),
      });
      setSelectedComplaint(null);
      await fetchData(societyId);
    } catch (err: any) {
      setError(err.message || 'Failed to update complaint status');
    } finally {
      setUpdating(false);
    }
  };

  const getPriorityBadge = (prio: Complaint['priority']) => {
    switch (prio) {
      case 'critical': return <span className="badge badge-error">Critical</span>;
      case 'high': return <span className="badge badge-warning">High</span>;
      case 'medium': return <span className="badge badge-info">Medium</span>;
      default: return <span className="badge badge-success">Low</span>;
    }
  };

  const getStatusBadge = (status: Complaint['status']) => {
    switch (status) {
      case 'resolved': return <span className="badge badge-success">Resolved</span>;
      case 'closed': return <span className="badge badge-info">Closed</span>;
      case 'in_progress': return <span className="badge badge-warning">In Progress</span>;
      case 'assigned': return <span className="badge badge-info">Assigned</span>;
      default: return <span className="badge badge-error">Open</span>;
    }
  };

  const filteredComplaints = filterStatus === 'all' 
    ? complaints 
    : complaints.filter(c => c.status === filterStatus);

  return (
    <div className="complaints-container fade-in">
      <header className="page-header">
        <div>
          <h1>Complaints desk</h1>
          <p className="subtitle">Track, assign, and resolve resident complaints using AI-powered triage helper</p>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Filter bar */}
      <div className="filter-bar glass-panel">
        <div className="filter-group">
          <Filter size={16} />
          <span>Filter Status:</span>
          {['all', 'open', 'assigned', 'in_progress', 'resolved', 'closed'].map(status => (
            <button 
              key={status}
              className={`filter-btn ${filterStatus === status ? 'active' : ''}`}
              onClick={() => setFilterStatus(status)}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Main Complaints List */}
      <div className="panel-container glass-panel">
        <div className="panel-header">
          <MessageSquare className="header-icon text-indigo" />
          <h2>Resident Complaints Desk ({filteredComplaints.length})</h2>
        </div>

        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : filteredComplaints.length === 0 ? (
          <div className="empty-state">No complaints registered in this category.</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Topic</th>
                  <th>Resident</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned To</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map(complaint => (
                  <tr key={complaint.id}>
                    <td className="topic-cell">
                      <div className="complaint-title-wrapper">
                        <strong>{complaint.title}</strong>
                        <p className="desc-preview">{complaint.description || 'No description provided.'}</p>
                      </div>
                    </td>
                    <td>
                      <div>
                        <strong>{complaint.raisedBy?.name || 'Resident'}</strong>
                        <div className="text-secondary font-sm">Flat {complaint.flatNumber}</div>
                      </div>
                    </td>
                    <td><span className="category-tag">{complaint.category || 'general'}</span></td>
                    <td>{getPriorityBadge(complaint.priority)}</td>
                    <td>{getStatusBadge(complaint.status)}</td>
                    <td>{complaint.assignedTo?.name || <span className="text-muted">Unassigned</span>}</td>
                    <td>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenUpdateModal(complaint)}
                      >
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manage Status Modal */}
      {selectedComplaint && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel fade-in">
            <h3>Manage Complaint Status</h3>
            <p className="modal-subtitle">Update status and assign task workers for: "{selectedComplaint.title}"</p>
            
            <form onSubmit={handleUpdateStatus} className="modal-form">
              <div className="form-group">
                <label className="form-label">Update Status</label>
                <select 
                  className="form-input"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as Complaint['status'])}
                >
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Assign To</label>
                <select 
                  className="form-input"
                  value={assignedToId}
                  onChange={(e) => setAssignedToId(e.target.value)}
                >
                  <option value="">-- Unassigned --</option>
                  {members.map(member => (
                    <option key={member.id} value={member.userId}>
                      {member.user?.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Resolution Notes</label>
                <textarea 
                  className="form-input text-area" 
                  placeholder="Enter details about updates or action taken..."
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={updating}>
                  {updating ? 'Updating...' : 'Save Changes'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedComplaint(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .complaints-container {
          display: flex;
          flex-direction: column;
          gap: 25px;
        }

        .filter-bar {
          padding: 16px 20px;
          border-radius: 12px;
        }

        .filter-group {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .filter-btn {
          background: transparent;
          border: 1px solid var(--border-muted);
          color: var(--text-secondary);
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 0.8rem;
          text-transform: capitalize;
          transition: all 0.2s;
        }

        .filter-btn:hover {
          color: var(--text-primary);
          background: rgba(255, 255, 255, 0.02);
        }

        .filter-btn.active {
          background: var(--accent-admin-gradient);
          color: #fff;
          border-color: transparent;
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

        .topic-cell {
          max-width: 300px;
        }

        .complaint-title-wrapper {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .desc-preview {
          font-size: 0.8rem;
          color: var(--text-secondary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .category-tag {
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid var(--border-muted);
          padding: 4px 8px;
          border-radius: 6px;
          color: var(--text-secondary);
          text-transform: capitalize;
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
        }

        .font-sm {
          font-size: 0.8rem;
        }

        /* Modal Styles */
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
        }

        .modal-content {
          width: 100%;
          max-width: 500px;
          padding: 30px;
          border-radius: 20px;
        }

        .modal-content h3 {
          font-size: 1.25rem;
          margin-bottom: 6px;
        }

        .modal-subtitle {
          font-size: 0.85rem;
          color: var(--text-secondary);
          margin-bottom: 20px;
        }

        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .text-area {
          resize: vertical;
          font-family: inherit;
        }

        .modal-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 10px;
        }
      `}</style>
    </div>
  );
}
