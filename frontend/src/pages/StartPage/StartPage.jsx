import React, { useState } from 'react';
import './StartPage.css';
import { Send, Map, Crosshair, Play } from 'lucide-react';

export default function StartPage({ onStartFlight, loadingMessage, infoMessage, error }) {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Система ИИ инициализирована. Подключена к БПЛА по протоколу MCP. Какой объект планируем обследовать сегодня?' }
  ]);
  const [hasRoute, setHasRoute] = useState(false);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    
    const newMessages = [...messages, { role: 'user', text: chatInput }];
    setMessages(newMessages);
    setChatInput('');
    
    // Эмуляция ответа ИИ
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: 'Параметры приняты. Оптимальный маршрут полета построен. Проверьте визуализацию на панели справа перед началом выполнения.' 
      }]);
      setHasRoute(true);
    }, 1500);
  };

  return (
    <div className="start-page page-transition">
      <div className="start-grid">
        <div className="chat-container">
          <div className="chat-header">
            <h3>Ассистент миссии</h3>
            <span className="status-dot online"></span>
          </div>
          
          <div className="chat-messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-bubble-wrapper ${msg.role === 'user' ? 'right' : 'left'}`}>
                <div className={`chat-bubble chat-bubble--${msg.role}`}>
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
          
          <div className="chat-input-area">
            <input 
              type="text" 
              className="chat-input" 
              placeholder="Введите параметры объекта или команды..." 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button className="btn-icon" onClick={handleSendMessage}>
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="map-container">
          <div className="map-view">
            {!hasRoute ? (
              <div className="map-empty">
                <Map size={48} className="map-icon-placeholder" />
                <p>Ожидание генерации маршрута...</p>
              </div>
            ) : (
              <div className="map-generated">
                <div className="map-overlay-grid"></div>
                <div className="route-path"></div>
                <Crosshair size={32} className="drone-cursor" />
              </div>
            )}
          </div>
          
          <div className="map-controls">
            <div className="mission-info">
              <h4>Текущая миссия</h4>
              <p>{hasRoute ? 'Маршрут готов к выполнению. Расчетное время: 14 мин.' : 'Параметры не заданы'}</p>
            </div>
            <button 
              className="btn-primary start-flight-btn" 
              onClick={onStartFlight}
              disabled={!!loadingMessage || !hasRoute}
            >
              <Play size={16} />
              {loadingMessage || 'Запустить БПЛА'}
            </button>
            {infoMessage && <p className="status-msg info">{infoMessage}</p>}
            {error && <p className="status-msg error">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
