"use client";

import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { Lock, Phone, ShieldCheck, KeyRound, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [isAdmin, setIsAdmin] = useState(true); // true = Admin, false = Super Admin
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [secret, setSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);
    try {
      let data;
      
      if (isAdmin) {
        // Standard user login (Society Admin PIN verification)
        const cleanedPhone = phone.replace(/\D/g, '');
        if (cleanedPhone.length !== 10) {
          throw new Error('Phone number must be exactly 10 digits');
        }
        if (pin.length !== 6) {
          throw new Error('Security PIN must be exactly 6 digits');
        }

        data = await apiRequest('/auth/admin/login', {
          method: 'POST',
          body: JSON.stringify({
            phone: cleanedPhone,
            pin,
          }),
        });

        // Verify if they are approved admins or committee members
        if (!data.memberships || data.memberships.length === 0) {
          throw new Error('No memberships found. Please join a society via mobile app first.');
        }
        
        const approvedAdminMember = data.memberships.find(
          (m: any) => (m.role === 'admin' || m.role === 'committee') && m.status === 'approved'
        );

        if (!approvedAdminMember) {
          throw new Error('Access denied: You must be an approved Admin or Committee member of a society.');
        }

        localStorage.setItem('sh_token', data.tokens.accessToken);
        localStorage.setItem('sh_user', JSON.stringify({
          id: data.user.id,
          name: data.user.name,
          role: approvedAdminMember.role,
          societyId: approvedAdminMember.societyId,
          societyName: approvedAdminMember.societyName
        }));

        window.location.href = '/dashboard';
      } else {
        // Super Admin Direct Password Login
        data = await apiRequest('/auth/super-admin/login', {
          method: 'POST',
          body: JSON.stringify({
            superAdminSecret: secret,
          }),
        });

        localStorage.setItem('sh_token', data.accessToken);
        localStorage.setItem('sh_user', JSON.stringify({
          id: data.user.id,
          name: data.user.name,
          role: 'superadmin',
        }));

        window.location.href = '/super-admin';
      }
    } catch (err: any) {
      setError(err.message || 'Login verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-container">
      <div className="login-card glass-panel fade-in">
        <div className="logo-section">
          <div className="logo-glow"></div>
          <Sparkles className="logo-icon" size={32} />
          <h2>Urban<span>Hub</span></h2>
          <p className="subtitle">Portal Access Management</p>
        </div>

        {/* Tab Selector */}
        <div className="role-selector">
          <button 
            type="button" 
            className={`role-btn ${isAdmin ? 'active' : ''}`}
            onClick={() => {
              setIsAdmin(true);
              setPhone('');
              setPin('');
              setError('');
              setMessage('');
            }}
          >
            <ShieldCheck size={18} />
            Society Admin
          </button>
          <button 
            type="button" 
            className={`role-btn-super ${!isAdmin ? 'active' : ''}`}
            onClick={() => {
              setIsAdmin(false);
              setSecret('');
              setError('');
              setMessage('');
            }}
          >
            <Lock size={18} />
            Super Admin
          </button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <form onSubmit={handleLogin} className="login-form">
          {isAdmin ? (
            <>
              <div className="form-group">
                <label className="form-label" htmlFor="phone">Phone Number</label>
                <div className="input-with-icon">
                  <Phone size={18} className="input-icon" />
                  <input 
                    id="phone"
                    type="tel" 
                    className="form-input" 
                    placeholder="9876543210" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pin">6-Digit Security PIN</label>
                <div className="input-with-icon">
                  <Lock size={18} className="input-icon" />
                  <input 
                    id="pin"
                    type="password" 
                    className="form-input" 
                    placeholder="******" 
                    maxLength={6}
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="secret">Super Admin Password</label>
              <div className="input-with-icon">
                <KeyRound size={18} className="input-icon" />
                <input 
                  id="secret"
                  type="password" 
                  className="form-input" 
                  placeholder="Enter platform secret key" 
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-actions">
            <button 
              type="submit" 
              className={`btn ${isAdmin ? 'btn-primary' : 'btn-super'} full-width`} 
              disabled={loading}
            >
              {loading ? 'Authenticating...' : 'Sign In'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
