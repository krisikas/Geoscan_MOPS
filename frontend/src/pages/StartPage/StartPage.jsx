import React, { useState } from 'react';
import './StartPage.css';

export default function StartPage({ onStartFlight, loadingMessage, infoMessage, error }) {
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Привет! Я нейросеть МОПС. Подключена по протоколу MCP к дрону. Какой маршрут сканирования вам предложить?' }
  ]);

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;
    
    const newMessages = [...messages, { role: 'user', text: chatInput }];
    setMessages(newMessages);
    setChatInput('');
    
    // Эмуляция ответа ИИ
    setTimeout(() => {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: 'Поняла вас. Сгенерировала оптимальный маршрут для облета здания. Ознакомьтесь с ним на панели справа и подтвердите.' 
      }]);
    }, 1000);
  };

  return (
    <div className="start-page">
      <div className="panel chat-panel">
        <div className="chat-messages">
          {messages.map((msg, idx) => (
            <div key={idx} className={`chat-bubble chat-bubble--${msg.role}`}>
              {msg.text}
            </div>
          ))}
        </div>
        
        <div className="chat-input-wrapper">
          <input 
            type="text" 
            className="chat-input" 
            placeholder="Input" 
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="chat-send-btn" onClick={handleSendMessage}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="panel map-panel">
        <div className="map-placeholder">
          <h3>Маршрут пролета</h3>
          <p className="map-info">Ожидание генерации маршрута нейросетью...</p>
        </div>
        <div className="map-actions">
          <button 
            className="btn-primary w-full" 
            onClick={onStartFlight}
            disabled={!!loadingMessage}
          >
            {loadingMessage || 'Подтвердить маршрут и начать полет'}
          </button>
          {infoMessage && <p className="status-msg info">{infoMessage}</p>}
          {error && <p className="status-msg error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
