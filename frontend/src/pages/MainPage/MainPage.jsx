import React from 'react';
import './MainPage.css';
import { Link } from 'react-router-dom';
import { ArrowRight, Navigation, Scan, Layers } from 'lucide-react';

export default function MainPage() {
  return (
    <div className="main-landing">
      {/* Navbar for Landing */}
      <nav className="landing-nav">
        <div className="landing-logo">GEOSCAN <span>MOPS</span></div>
        <div className="landing-nav-actions">
          <Link to="/auth" className="btn-secondary">Войти</Link>
          <Link to="/auth" className="btn-primary">Начать работу <ArrowRight size={16} /></Link>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="hero-content">
          <div className="badge">Система следующего поколения</div>
          <h1 className="hero-title">
            Интеллектуальный<br />
            <span>мониторинг сооружений</span>
          </h1>
          <p className="hero-subtitle">
            МОПС обеспечивает автоматизированное управление БПЛА, построение высокоточных 3D-моделей и анализ дефектов поверхностей с помощью ИИ.
          </p>
          <div className="hero-actions">
            <Link to="/auth" className="btn-primary btn-large">Начать сканирование</Link>
          </div>
        </div>
      </header>

      <section className="landing-features">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper"><Navigation size={28} /></div>
            <h3>Автономные полеты</h3>
            <p>Прокладывайте маршруты с помощью нейросетей. Дрон выполнит сканирование без вмешательства пилота.</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon-wrapper"><Scan size={28} /></div>
            <h3>Фотограмметрия</h3>
            <p>Интеграция с Metashape позволяет собирать высокоточные 3D-модели объектов прямо в браузере.</p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon-wrapper"><Layers size={28} /></div>
            <h3>Анализ дефектов ИИ</h3>
            <p>Наша нейросеть автоматически выявляет трещины и коррозию на собранных снимках.</p>
          </div>
        </div>
      </section>

      <section className="landing-feed">
        <h2 className="section-title">Как это работает</h2>
        <div className="feed-items">
          <div className="feed-item">
            <div className="feed-content">
              <h3>1. Построение маршрута</h3>
              <p>Укажите объект и границы. Система сгенерирует оптимальный маршрут для полного покрытия powierzchni с требуемым перекрытием кадров.</p>
            </div>
            <div className="feed-visual feed-visual-1"></div>
          </div>
          
          <div className="feed-item reverse">
            <div className="feed-content">
              <h3>2. Обработка данных</h3>
              <p>После выгрузки фотографий сервер автоматически запустит процесс сборки 3D-модели и поиск дефектов.</p>
            </div>
            <div className="feed-visual feed-visual-2"></div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© 2026 GEOSCAN MOPS. Мониторинг и Обследование Поверхностей Сооружений.</p>
      </footer>
    </div>
  );
}
