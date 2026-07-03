"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { Users, Search, RefreshCw, Trash2 } from 'lucide-react';

interface User {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  avatarUrl: string | null;
  createdAt: string;
  isDeleted: boolean;
  _count: {
    memberships: number;
  };
}

export default function UsersRegistryPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/super-admin/users');
      setUsers(data.users || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch users list');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDeleteUser = async (id: string) => {
    if (!confirm('Are you sure you want to soft-delete this user account? They will lose access to all societies.')) return;
    setDeletingId(id);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/super-admin/users/${id}`, {
        method: 'DELETE',
      });
      setSuccess('User account deactivated successfully.');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.phone?.includes(searchQuery) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="users-container fade-in">
      <header className="page-header">
        <div>
          <h1>Users Registry</h1>
          <p className="subtitle">Audit and manage platform user accounts and active memberships</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchUsers}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="search-bar-wrapper glass-panel">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search users by name, phone, email..."
          className="search-input"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="panel-container glass-panel">
        <div className="panel-header">
          <Users className="header-icon text-indigo" />
          <h2>Users Registry Directory ({filteredUsers.length})</h2>
        </div>

        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : filteredUsers.length === 0 ? (
          <div className="empty-state">No users registered on the platform.</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>User / Profile</th>
                  <th>Phone Number</th>
                  <th>Email</th>
                  <th>Societies Joined</th>
                  <th>Registered Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className="user-info-td">
                        <div className="td-avatar bg-indigo">{user.name?.[0] || 'U'}</div>
                        <span>{user.name || 'Anonymous'}</span>
                      </div>
                    </td>
                    <td>{user.phone}</td>
                    <td>{user.email || <span className="text-muted">No Email</span>}</td>
                    <td>
                      <span className="badge badge-info">{user._count?.memberships || 0} Societies</span>
                    </td>
                    <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn btn-danger btn-sm flex-gap"
                        disabled={deletingId !== null}
                        onClick={() => handleDeleteUser(user.id)}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style jsx>{`
        .users-container {
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
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
        }

        .td-avatar.bg-indigo {
          background: var(--accent-super-gradient);
          border: none;
          color: #000;
        }

        .btn-sm {
          padding: 8px 12px;
          font-size: 0.8rem;
        }

        .flex-gap {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
      `}</style>
    </div>
  );
}
