import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './Sidebar.css';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import logoMops from '../../assets/MOPS.svg';

export default function Sidebar() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <img src={logoMops} alt="MOPS Logo" style={{ height: '24px', width: 'auto' }} />
            <span className="landing-logo" style={{ fontSize: '18px', fontWeight: 'bold' }}>
              GEOSCAN <span style={{ color: 'var(--color-accent)' }}>MOPS</span>
            </span>
          </div>
        </div>
        
        <nav className="nav-menu">
          <NavLink 
            to="/start" 
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </span>
            <span className="nav-label">Планирование</span>
          </NavLink>
          
          <NavLink 
            to="/result" 
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </span>
            <span className="nav-label">Результат</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="connection-status">
          <span className="status-dot"></span>
          <span className="status-text">БПЛА Подключен</span>
        </div>

        {user && (
          <div className="sidebar-user-card">
            <div className="sidebar-user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-email">{user.email}</span>
            </div>
            <button className="sidebar-logout-btn" onClick={handleLogout}>
              <LogOut size={18} />
              <span>Выйти</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
