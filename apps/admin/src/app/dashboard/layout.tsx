"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Users, MessageSquare, ShieldAlert, LogOut, LayoutDashboard,
  Settings, Key, Eye, HelpCircle, Sparkles, Building, DoorOpen, Wallet
} from 'lucide-react';

interface UserSession {
  id: string;
  name: string;
  role: string;
  societyId: string;
  societyName: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const rawUser = localStorage.getItem('sh_user');
    const token = localStorage.getItem('sh_token');
    
    if (!rawUser || !token) {
      window.location.href = '/';
      return;
    }

    try {
      const parsed = JSON.parse(rawUser);
      if (parsed.role === 'superadmin') {
        window.location.href = '/super-admin';
        return;
      }
      setUser(parsed);
    } catch {
      window.location.href = '/';
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('sh_token');
    localStorage.removeItem('sh_user');
    window.location.href = '/';
  };

  if (!user) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  const navItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Members Approval', href: '/dashboard/members', icon: Users },
    { name: 'Complaints', href: '/dashboard/complaints', icon: MessageSquare },
    { name: 'Gate Visitors', href: '/dashboard/visitors', icon: DoorOpen },
    { name: 'Payments', href: '/dashboard/payments', icon: Wallet },
    { name: 'SOS Alerts', href: '/dashboard/sos', icon: ShieldAlert },
    { name: 'Active Sessions', href: '/dashboard/sessions', icon: Settings },
  ];

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <aside className="sidebar glass-panel">
        <div className="sidebar-header">
          <Sparkles className="logo-icon" size={24} />
          <h2>Urban<span>Hub</span></h2>
        </div>

        <div className="society-badge">
          <Building size={16} />
          <span>{user.societyName}</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar">{user.name[0] || 'A'}</div>
            <div className="user-details">
              <p className="user-name">{user.name || 'Admin'}</p>
              <p className="user-role">{user.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn">
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {children}
      </main>

    </div>
  );
}
