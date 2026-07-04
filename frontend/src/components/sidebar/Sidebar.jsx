import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';
import logoB from '../../assets/logo_b.svg';
import logoW from '../../assets/logo_w.svg';

export default function Sidebar({ theme, onToggleTheme }) {
  const logo = theme === 'dark' || !theme ? logoW : logoB;

  return (
    <aside className="app-sidebar">
      <div className="sidebar-top">
        <div className="brand">
          <img src={logo} alt="GEOSCAN MOPS" className="brand-logo" />
        </div>
        
        <nav className="nav-menu">
          <NavLink 
            to="/" 
            className={({ isActive }) => `nav-item ${isActive ? 'nav-item--active' : ''}`}
            end
          >
            <span className="nav-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </span>
            <span className="nav-label">Гайд</span>
          </NavLink>
          
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
            <span className="nav-label">Нейросеть</span>
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
            <span className="nav-label">Обследование</span>
          </NavLink>
        </nav>
      </div>

      <div className="sidebar-bottom">
        <div className="connection-status">
          <span className="status-dot"></span>
          <span className="status-text">БПЛА Подключен</span>
        </div>

        <button 
          className="theme-toggle"
          onClick={onToggleTheme}
          aria-label="Сменить тему"
        >
          {theme === 'dark' ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
              </svg>
              <span>Светлая тема</span>
            </>
          ) : (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
              </svg>
              <span>Темная тема</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
