"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Building, Users, LogOut, LayoutDashboard, Settings, Key, Eye, 
  HelpCircle, Sparkles, ShieldAlert, ShieldCheck
} from 'lucide-react';

interface UserSession {
  id: string;
  name: string;
  role: string;
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
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
      if (parsed.role !== 'superadmin') {
        window.location.href = '/dashboard';
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
    { name: 'Platform Stats', href: '/super-admin', icon: LayoutDashboard },
    { name: 'Societies Registry', href: '/super-admin/societies', icon: Building },
    { name: 'Users Registry', href: '/super-admin/users', icon: Users },
  ];

  return (
    <div className="layout-container">
      {/* Sidebar */}
      <aside className="sidebar glass-panel border-super">
        <div className="sidebar-header">
          <Sparkles className="logo-icon-super" size={24} />
          <h2>Platform<span>HQ</span></h2>
        </div>

        <div className="society-badge-super">
          <ShieldAlert size={16} />
          <span>SUPER ADMIN ROUTE</span>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`nav-link-super ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="avatar-super">{user.name[0] || 'S'}</div>
            <div className="user-details">
              <p className="user-name">{user.name || 'Super Admin'}</p>
              <p className="user-role-super">System Root</p>
            </div>
          </div>
          <button onClick={handleLogout} className="logout-btn-super">
            <LogOut size={16} />
            <span>Logout Root</span>
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
