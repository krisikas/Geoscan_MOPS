import React from 'react';
import './MainPage.css';
import { Link } from 'react-router-dom';

export default function MainPage() {
  return (
    <div className="main-page">
      <div className="panel guide-panel">
        <h2 className="guide-title">Добро пожаловать в МОПС</h2>
        <p className="guide-text">
          Мониторинг и Обследование Поверхностей Сооружений (МОПС) — это передовая система 
          для управления БПЛА и анализа полученных данных.
        </p>
        
        <div className="guide-steps">
          <div className="guide-step">
            <div className="step-number">1</div>
            <h3>Подключение и старт</h3>
            <p>Перейдите на вкладку «Старт». Там вы сможете взаимодействовать с нейросетью, которая поможет проложить маршрут пролета для сканирования объекта. Убедитесь в правильности маршрута и подтвердите его.</p>
          </div>
          <div className="guide-step">
            <div className="step-number">2</div>
            <h3>Сбор данных</h3>
            <p>После подтверждения маршрута дрон автоматически начнет полет. Все фотографии будут сохранены в текущую сессию для дальнейшей обработки.</p>
          </div>
          <div className="guide-step">
            <div className="step-number">3</div>
            <h3>Анализ результатов</h3>
            <p>На вкладке «Результат» вы сможете просмотреть полученную 3D-модель (из Metashape) и детально изучить каждую фотографию на наличие дефектов (трещин) с помощью ИИ.</p>
          </div>
        </div>

        <div className="guide-actions">
          <Link to="/start" className="btn-primary">Начать работу</Link>
        </div>
      </div>
    </div>
  );
}
