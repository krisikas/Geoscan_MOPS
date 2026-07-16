import React, { useState, useEffect, useRef } from 'react';
import './StartPage.css';
import { Send, Map, Crosshair, Play, Info, Plus } from 'lucide-react';
import RouteVisualizer from './RouteVisualizer';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export default function StartPage({ onStartFlight, loadingMessage, infoMessage, error }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Система ИИ инициализирована. Подключена к БПЛА по протоколу MCP. Какой объект планируем обследовать сегодня?' }
  ]);
  const [coordinates, setCoordinates] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const handleInput = (e) => {
    setChatInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + 'px';
    }
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/projects/`, { credentials: 'include' });
        if (res.status === 401) { logout(); navigate('/auth'); return; }
        if (!res.ok) throw new Error('Ошибка сети');
        const data = await res.json();
        if (data && data.length > 0) {
          setProjects(data);
          setActiveProject(prev => prev || data[0]); // keep active if exists, else pick first
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchProjects();
  }, [logout, navigate]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isThinking]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newProjectName })
      });
      if (!res.ok) throw new Error('Ошибка создания');
      const proj = await res.json();
      setProjects([proj, ...projects]);
      setActiveProject(proj);
      setIsCreatingProject(false);
      setNewProjectName('');
      setMessages([{ role: 'ai', text: 'Новый проект создан. Какой объект планируем обследовать?' }]);
      setCoordinates([]);
      setBuildings([]);
      setCurrentStep(0);
    } catch (e) { console.error(e); }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !activeProject || isThinking) return;
    
    const userMsg = { role: 'user', text: chatInput };
    const currentHistory = [...messages];
    const newMessages = [...currentHistory, userMsg];
    
    setMessages(newMessages);
    setChatInput('');
    setIsThinking(true);
    
    try {
      const historyPayload = currentHistory.map(m => ({ role: m.role, text: m.text }));
      
      const response = await fetch(`${API_BASE_URL}/api/projects/${activeProject.id}/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          history: historyPayload,
          new_prompt: userMsg.text
        })
      });

      if (response.status === 401) { logout(); navigate('/auth'); return; }
      if (!response.ok) {
         let errorText = 'Ошибка сервера';
         try { const errorData = await response.json(); errorText = errorData.detail || errorText; } catch(e) {}
         throw new Error(errorText);
      }

      const data = await response.json();
      
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: data.text || 'План обновлен.',
      }]);
      
      if (data.coordinates && data.coordinates.length > 0) {
         setCoordinates(data.coordinates);
         setCurrentStep(data.coordinates.length - 1);
      }
      if (data.buildings && data.buildings.length > 0) {
         setBuildings(data.buildings);
      }

    } catch (e) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        text: `[Системная ошибка]: ${e.message}`,
        isError: true
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const hasRoute = coordinates.length > 0;

  return (
    <div className="start-page page-transition">
      <div className="start-grid">
        <div className="chat-container">
          <div className="chat-header--extended">
            <div className="chat-header-top">
                <h3>Ассистент миссии</h3>
                <span className="status-dot online"></span>
            </div>
            
            <div className="project-selector-row">
                <select 
                    className="project-select" 
                    value={activeProject?.id || ''} 
                    onChange={(e) => {
                        const p = projects.find(x => x.id === parseInt(e.target.value));
                        setActiveProject(p);
                        setMessages([{ role: 'ai', text: `Проект "${p.name}" выбран. Ожидаю указаний.` }]);
                        setCoordinates([]);
                        setBuildings([]);
                        setCurrentStep(0);
                    }}
                >
                    <option value="" disabled>Выберите проект</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn-icon-small" onClick={() => setIsCreatingProject(!isCreatingProject)}>
                    <Plus size={16} />
                </button>
            </div>
            
            {isCreatingProject && (
                <div className="create-project-form">
                    <input 
                        type="text" 
                        placeholder="Название..." 
                        value={newProjectName} 
                        onChange={e => setNewProjectName(e.target.value)} 
                    />
                    <button onClick={handleCreateProject}>Создать</button>
                </div>
            )}
          </div>
          
          <div className="chat-messages">
            {!activeProject && (
                <div className="chat-bubble-wrapper left">
                    <div className="chat-bubble chat-bubble--ai error-bubble">
                        Для начала планирования необходимо создать Проект на вкладке "Результат".
                    </div>
                </div>
            )}
            
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-bubble-wrapper ${msg.role === 'user' ? 'right' : 'left'}`}>
                <div className={`chat-bubble chat-bubble--${msg.role} ${msg.isError ? 'error-bubble' : ''}`}>
                  {msg.text}
                </div>
              </div>
            ))}
            
            {isThinking && (
              <div className="chat-bubble-wrapper left">
                <div className="chat-bubble chat-bubble--ai">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          <div className="chat-input-area">
            <textarea
              ref={textareaRef}
              className="chat-input" 
              placeholder={activeProject ? "Введите параметры объекта или команды..." : "Создайте проект для начала..."} 
              value={chatInput}
              rows={1}
              onChange={handleInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                  if (textareaRef.current) {
                    textareaRef.current.style.height = '44px';
                  }
                }
              }}
              disabled={!activeProject}
            />
            <button className="btn-icon" onClick={() => {
              handleSendMessage();
              if (textareaRef.current) {
                textareaRef.current.style.height = '44px';
              }
            }} disabled={!activeProject || isThinking || !chatInput.trim()}>
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="map-container">
          <div className="map-view" style={{ position: 'relative' }}>
            <RouteVisualizer coordinates={coordinates} buildings={buildings} currentStep={currentStep} />
          </div>
          
          <div className="map-controls" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="mission-info">
                  <h4>Текущая миссия</h4>
                  <p>{hasRoute ? `Маршрут построен. Количество точек: ${coordinates.length}` : 'Параметры не заданы'}</p>
                </div>
                <button 
                  className="btn-primary start-flight-btn" 
                  onClick={onStartFlight}
                  disabled={!!loadingMessage || !hasRoute}
                >
                  <Play size={16} />
                  {loadingMessage || 'Запустить БПЛА'}
                </button>
            </div>
            
            {hasRoute && (
                <div className="step-slider-container" style={{ display: 'flex', alignItems: 'center', gap: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px 16px', borderRadius: '8px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Шаг: {currentStep + 1} / {coordinates.length}</span>
                    <input 
                        type="range" 
                        min="0" 
                        max={coordinates.length > 0 ? coordinates.length - 1 : 0} 
                        value={currentStep} 
                        onChange={(e) => setCurrentStep(parseInt(e.target.value))}
                        style={{ flex: 1, accentColor: 'var(--color-accent)' }}
                    />
                </div>
            )}
            
            {infoMessage && <p className="status-msg info">{infoMessage}</p>}
            {error && <p className="status-msg error">{error}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
