import './leftPanel.css'
import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const location = useLocation();

  const toggleSidebar = () => {
    if (!isOpen) {
      setIsVisible(true);
      setTimeout(() => setIsOpen(true), 10);
    } else {
      setIsOpen(false);
      setTimeout(() => setIsVisible(false), 300);
    }
  };

  const closeSidebar = () => {
    if(isOpen) {
        setIsOpen(false);
        setTimeout(() => setIsVisible(false), 300);
    }
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.keyCode === 27 && isOpen) {
        closeSidebar();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  useEffect(() => {
    // Close sidebar on route change
    closeSidebar();
  }, [location.pathname]);

  return (
    <>
      <button 
        className="sidebar-toggle"
        onClick={toggleSidebar}
        aria-label="Открыть меню"
      >
        <span className="sidebar-toggle__line"></span>
        <span className="sidebar-toggle__line"></span>
        <span className="sidebar-toggle__line"></span>
      </button>

      {isVisible && (
        <div 
          className={`sidebar-overlay ${isOpen ? 'sidebar-overlay--active' : ''}`}
          onClick={closeSidebar}
        />
      )}

      <aside 
        className={`sidebar ${isOpen ? 'sidebar--open' : ''}`}
        aria-hidden={!isOpen}
      >
        <div className="sidebar__content">
          <div className="sidebar__header">
            <h2 className="sidebar__title">Навигация</h2>
            <button 
              className="sidebar__close"
              onClick={closeSidebar}
              aria-label="Закрыть меню"
            >
              <span></span>
              <span></span>
            </button>
          </div>

          <nav className="sidebar__nav">
            <ul className="sidebar__menu">
              <li className="sidebar__item">
                <Link to="/" className="sidebar__link">
                  <span className="sidebar__text">Главная</span>
                </Link>
              </li>
              <li className="sidebar__item">
                <Link to="/start" className="sidebar__link">
                  <span className="sidebar__text">Старт полёта (Нейросеть)</span>
                </Link>
              </li>
              <li className="sidebar__item">
                <Link to="/result" className="sidebar__link">
                  <span className="sidebar__text">Результаты (3D и Фото)</span>
                </Link>
              </li>
            </ul>
          </nav>

          <div className="sidebar__footer">
            <a 
              href="https://github.com/ArduRadioKot/Geoscan_MOPS" 
              target="_blank" 
              rel="noopener noreferrer"
              className="sidebar__github-link"
            >
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                className="sidebar__github-icon"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span className="sidebar__github-text">GitHub</span>
            </a>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;