"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { Laptop, Trash2, ShieldCheck, RefreshCw, KeyRound, Monitor, Smartphone } from 'lucide-react';

interface Device {
  id: string;
  deviceId: string;
  deviceName: string | null;
  ipAddress: string | null;
  lastSeenAt: string;
  isTrusted: boolean;
  createdAt: string;
}

export default function ActiveSessionsPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await apiRequest('/auth/devices');
      setDevices(data.devices || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load active sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to log out this device?')) return;
    setRevokingId(id);
    setError('');
    setSuccess('');
    try {
      await apiRequest(`/auth/devices/${id}`, {
        method: 'DELETE',
      });
      setSuccess('Session revoked successfully.');
      await fetchSessions();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke device session');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="sessions-container fade-in">
      <header className="page-header">
        <div>
          <h1>Active Devices & Sessions</h1>
          <p className="subtitle">Manage logged-in devices and revoke sessions to secure your account</p>
        </div>
        <button className="btn btn-secondary" onClick={fetchSessions}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="panel-container glass-panel">
        <div className="panel-header">
          <KeyRound className="header-icon text-indigo" />
          <h2>Security Sessions Logs ({devices.length})</h2>
        </div>

        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : devices.length === 0 ? (
          <div className="empty-state">No active sessions found.</div>
        ) : (
          <div className="devices-list">
            {devices.map(device => {
              const isDesktop = device.deviceName?.toLowerCase().includes('windows') || 
                                device.deviceName?.toLowerCase().includes('mac') || 
                                device.deviceName?.toLowerCase().includes('web') ||
                                device.deviceName?.toLowerCase().includes('chrome');
              return (
                <div key={device.id} className="device-card glass-panel">
                  <div className="device-card-left">
                    <div className="device-icon-wrapper">
                      {isDesktop ? <Monitor size={24} /> : <Smartphone size={24} />}
                    </div>
                    <div className="device-meta">
                      <h4>{device.deviceName || 'Unknown Device'}</h4>
                      <p className="device-ip">IP Address: {device.ipAddress || 'Unknown'}</p>
                      <p className="device-date">
                        First Authorized: {new Date(device.createdAt).toLocaleDateString()}
                      </p>
                      <p className="device-seen">
                        Last Active: {new Date(device.lastSeenAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="device-card-right">
                    {device.isTrusted && (
                      <span className="badge badge-success flex-gap">
                        <ShieldCheck size={12} />
                        Trusted
                      </span>
                    )}
                    <button 
                      className="btn btn-danger btn-sm"
                      disabled={revokingId !== null}
                      onClick={() => handleRevoke(device.id)}
                    >
                      <Trash2 size={14} />
                      Revoke
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .sessions-container {
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

        .devices-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .device-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.01);
          border: 1px solid var(--border-muted);
        }

        .device-card:hover {
          background: rgba(255, 255, 255, 0.03);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .device-card-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .device-icon-wrapper {
          width: 50px;
          height: 50px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border-muted);
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-secondary);
        }

        .device-meta h4 {
          font-size: 1rem;
          color: var(--text-primary);
          margin-bottom: 2px;
        }

        .device-ip, .device-date, .device-seen {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .device-card-right {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .flex-gap {
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .btn-sm {
          padding: 8px 12px;
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
}
