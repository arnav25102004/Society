"use client";

import { useEffect, useState } from 'react';
import { apiRequest } from '../../../lib/api';
import { Wallet, IndianRupee, Filter, CheckCircle2 } from 'lucide-react';

interface Bill {
  id: string;
  flatNumber: string;
  billMonth: string;
  totalAmount: string;
  status: 'unpaid' | 'paid' | 'partial' | 'overdue';
  dueDate: string;
  notes: string | null;
}

export default function PaymentsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [societyId, setSocietyId] = useState('');
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('unpaid');

  // Mark-paid modal state (two steps: PIN confirm, then payment details)
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [pin, setPin] = useState('');
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'cash'>('cash');
  const [transactionId, setTransactionId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchBills = async (sId: string) => {
    try {
      setLoading(true);
      const data = await apiRequest(`/payments/bills?societyId=${sId}`);
      setBills(data.bills || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    if (!rawUser) return;
    const user = JSON.parse(rawUser);
    setSocietyId(user.societyId);
    fetchBills(user.societyId);
  }, []);

  const openMarkPaid = (bill: Bill) => {
    setSelectedBill(bill);
    setPin('');
    setActionToken(null);
    setPaymentMethod('cash');
    setTransactionId('');
    setNotes('');
    setModalError('');
  };

  const closeModal = () => setSelectedBill(null);

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');
    setSubmitting(true);
    try {
      const data = await apiRequest('/auth/pin/verify', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      setActionToken(data.sensitiveActionToken);
    } catch (err: any) {
      setModalError(err.message || 'Incorrect PIN');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill || !actionToken) return;
    setModalError('');
    setSubmitting(true);
    try {
      await apiRequest(`/payments/bills/${selectedBill.id}/mark-paid`, {
        method: 'POST',
        headers: { 'X-Action-Token': actionToken },
        body: JSON.stringify({
          paymentMethod,
          transactionId: transactionId || undefined,
          notes: notes || undefined,
        }),
      });
      closeModal();
      await fetchBills(societyId);
    } catch (err: any) {
      setModalError(err.message || 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: Bill['status']) => {
    switch (status) {
      case 'paid': return <span className="badge badge-success">Paid</span>;
      case 'overdue': return <span className="badge badge-error">Overdue</span>;
      case 'partial': return <span className="badge badge-warning">Partial</span>;
      default: return <span className="badge badge-info">Unpaid</span>;
    }
  };

  const filteredBills = filterStatus === 'all' ? bills : bills.filter(b => b.status === filterStatus);

  return (
    <div className="payments-container fade-in">
      <header className="page-header">
        <div>
          <h1>Maintenance payments</h1>
          <p className="subtitle">
            Residents pay you directly (cash / UPI / bank transfer) — record it here once received.
          </p>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="filter-bar glass-panel">
        <div className="filter-group">
          <Filter size={16} />
          <span>Filter Status:</span>
          {['unpaid', 'overdue', 'paid', 'partial', 'all'].map(status => (
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

      <div className="panel-container glass-panel">
        <div className="panel-header">
          <Wallet className="header-icon text-indigo" />
          <h2>Bills ({filteredBills.length})</h2>
        </div>

        {loading ? (
          <div className="loader-box"><div className="spinner"></div></div>
        ) : filteredBills.length === 0 ? (
          <div className="empty-state">No bills in this category.</div>
        ) : (
          <div className="table-container">
            <table className="app-table">
              <thead>
                <tr>
                  <th>Flat</th>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map(bill => (
                  <tr key={bill.id}>
                    <td><strong>{bill.flatNumber}</strong></td>
                    <td>{new Date(bill.billMonth).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</td>
                    <td>
                      <span className="amount-cell">
                        <IndianRupee size={13} />
                        {Number(bill.totalAmount).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td>{new Date(bill.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                    <td>{getStatusBadge(bill.status)}</td>
                    <td>
                      {bill.status !== 'paid' ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => openMarkPaid(bill)}>
                          Mark Paid
                        </button>
                      ) : (
                        <span className="text-muted font-sm">
                          <CheckCircle2 size={13} /> Settled
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedBill && (
        <div className="modal-backdrop">
          <div className="modal-content glass-panel fade-in">
            <h3>Mark Bill as Paid</h3>
            <p className="modal-subtitle">
              Flat {selectedBill.flatNumber} — ₹{Number(selectedBill.totalAmount).toLocaleString('en-IN')}
            </p>

            {!actionToken ? (
              <form onSubmit={handleVerifyPin} className="modal-form">
                <div className="form-group">
                  <label className="form-label">Enter your PIN to confirm</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    className="form-input"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                {modalError && <div className="alert alert-error">{modalError}</div>}
                <div className="modal-actions">
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Verifying...' : 'Verify'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleMarkPaid} className="modal-form">
                <div className="form-group">
                  <label className="form-label">Payment Method</label>
                  <select
                    className="form-input"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="netbanking">Net Banking</option>
                    <option value="card">Card</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Transaction / Reference ID (optional)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="e.g. UPI ref number"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <textarea
                    className="form-input text-area"
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. cash handed to treasurer on..."
                  />
                </div>

                {modalError && <div className="alert alert-error">{modalError}</div>}

                <div className="modal-actions">
                  <button type="submit" className="btn btn-primary" disabled={submitting}>
                    {submitting ? 'Recording...' : 'Confirm Payment'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .payments-container {
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

        .amount-cell {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          font-weight: 600;
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
        }

        .font-sm {
          font-size: 0.8rem;
          display: inline-flex;
          align-items: center;
          gap: 4px;
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
          max-width: 420px;
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
