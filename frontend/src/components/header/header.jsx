import React from 'react';
import { NavLink } from 'react-router-dom';
import './header.css';
import logoB from '../../assets/logo_b.svg';
import logoW from '../../assets/logo_w.svg';

export default function Header({ theme, onToggleTheme }) {
    const logo = theme === 'dark' || !theme ? logoW : logoB;

    return (
        <header className="header-wrapper">
            <div className="header">
                <div className="header__brand">
                    <img src={logo} alt="GEOSCAN MOPS" className="header__logo" />
                </div>
                
                <nav className="header__nav">
                    <NavLink 
                        to="/" 
                        className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                        end
                    >
                        Гайд
                    </NavLink>
                    <NavLink 
                        to="/start" 
                        className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                    >
                        Нейросеть
                    </NavLink>
                    <NavLink 
                        to="/result" 
                        className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                    >
                        Обследование
                    </NavLink>
                </nav>

                <div className="header__actions">
                    <button 
                        className="header__theme-toggle"
                        onClick={onToggleTheme}
                        aria-label="Сменить тему"
                    >
                        {theme === 'dark' ? (
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
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                            </svg>
                        )}
                    </button>
                    <div className="header__status">
                        <span className="status-dot"></span>
                        <span className="status-text">БПЛА Подключен</span>
                    </div>
                </div>
            </div>
        </header>
    );
}
