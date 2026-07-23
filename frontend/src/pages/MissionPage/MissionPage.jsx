import React, { useState, useEffect, useRef } from 'react';
import './MissionPage.css';
import { Send, Map, Crosshair, Play, Info, Plus, Mic } from 'lucide-react';
import RouteVisualizer from './RouteVisualizer';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export default function MissionPage({ onStartFlight, loadingMessage, infoMessage, error }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
  ]);
  const [coordinates, setCoordinates] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [droneIp, setDroneIp] = useState('10.132.236.186');
  const [realTrajectory, setRealTrajectory] = useState([]);
  const [droneFeed, setDroneFeed] = useState(null);
  const [thermalFeed, setThermalFeed] = useState(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const wsRef = useRef(null);
  const telemetryWsRef = useRef(null);
  const recognitionRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);

  // Clean up WS on unmount
  useEffect(() => {
      return () => {
          if (wsRef.current) wsRef.current.close();
          if (telemetryWsRef.current) telemetryWsRef.current.close();
      };
  }, []);

  const handleInput = (e) => {
    setChatInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = scrollHeight + 'px';
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Ваш браузер не поддерживает голосовой ввод. Попробуйте Google Chrome.');
      return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    recognition.onstart = () => setIsRecording(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setChatInput(prev => prev + (prev ? ' ' : '') + transcript);
      if (textareaRef.current) {
        setTimeout(() => {
          textareaRef.current.style.height = '44px';
          textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }, 50);
      }
    };
    
    recognition.onerror = (e) => {
      console.error('Speech recognition error', e);
      setIsRecording(false);
    };
    
    recognition.onend = () => setIsRecording(false);
    
    recognitionRef.current = recognition;
    recognition.start();
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

  useEffect(() => {
    if (activeProject) {
        navigate(`/mission/${activeProject.id}`, { replace: true });
    }
  }, [activeProject, navigate]);

  useEffect(() => {
    if (!activeProject) return;
    const loadChat = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/projects/${activeProject.id}/chat`, { credentials: 'include' });
        if (res.ok) {
          const chatData = await res.json();
          if (chatData.length > 0) {
            setMessages(chatData);
            if (activeProject.route_data && activeProject.route_data.coordinates) {
                setCoordinates(activeProject.route_data.coordinates);
                setBuildings(activeProject.route_data.buildings || []);
            }
          } else {
            setMessages([{ role: 'ai', text: 'Система ИИ инициализирована. Подключена к БПЛА по протоколу MCP. Какой объект планируем обследовать сегодня?' }]);
          }
        }
      } catch (e) {
        console.error("Failed to load chat", e);
      }
    };
    loadChat();
  }, [activeProject]);

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
    
    const userMsg = { role: 'user', content: chatInput };
    const currentHistory = [...messages];
    const newMessages = [...currentHistory, userMsg];
    
    setMessages(newMessages);
    setChatInput('');
    setIsThinking(true);
    
    try {
      const historyPayload = currentHistory.map(m => ({ role: m.role, text: m.content || "" }));
      
      const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/api/projects/${activeProject.id}/stream_plan`;
      const planWs = new WebSocket(wsUrl);
      
      planWs.onopen = () => {
          planWs.send(JSON.stringify({
              history: historyPayload,
              new_prompt: userMsg.content,
              current_route: activeProject.route_data || null
          }));
      };
      
      planWs.onmessage = (event) => {
          try {
              const data = JSON.parse(event.data);
              if (data.type === "final_plan") {
                  setIsThinking(false);
                  const finalData = data.data;
                  setMessages(prev => [...prev, { role: 'ai', content: finalData.text }]);
                  
                  if (finalData.coordinates || finalData.buildings) {
                      setActiveProject(prev => ({
                          ...prev,
                          route_data: {
                              coordinates: finalData.coordinates || prev.route_data?.coordinates,
                              buildings: finalData.buildings || prev.route_data?.buildings
                          }
                      }));
                  }
                  
                  if (finalData.coordinates && finalData.coordinates.length > 0) {
                      setCoordinates(finalData.coordinates);
                      setCurrentStep(0);
                  }
                  if (finalData.buildings && finalData.buildings.length > 0) {
                      setBuildings(finalData.buildings);
                  }
                  planWs.close();
              } else if (data.type === "error") {
                  setIsThinking(false);
                  setMessages(prev => [...prev, { role: 'ai', content: data.message, isError: true }]);
                  planWs.close();
              } else if (data.role) {
                  setMessages(prev => [...prev, data]);
              }
          } catch (e) {
              setMessages(prev => [...prev, { role: 'ai', content: event.data }]);
          }
      };
      
      planWs.onerror = () => {
          setIsThinking(false);
          setMessages(prev => [...prev, { role: 'ai', content: 'Ошибка WebSocket соединения при планировании.', isError: true }]);
      };
      
      planWs.onclose = () => {
          setIsThinking(false);
      };
      
    } catch (e) {
      setMessages(prev => [...prev, { 
        role: 'ai', 
        content: `[Системная ошибка]: ${e.message}`,
        isError: true
      }]);
      setIsThinking(false);
    }
  };

  const handleStartRealFlight = () => {
    if (!activeProject || !hasRoute) return;
    
    // Call the parent's function for top-level loading state if desired
    onStartFlight();

    setIsExecuting(true);
    setIsThinking(true);
    setRealTrajectory([]); // clear previous flight trajectory

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + `/api/projects/${activeProject.id}/stream_flight?ip=${droneIp}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
        setIsThinking(false);
        try {
            const data = JSON.parse(event.data);
            setMessages(prev => [...prev, data]);
        } catch (e) {
            setMessages(prev => [...prev, { role: 'ai', content: event.data }]);
        }
    };

    ws.onerror = () => {
        setMessages(prev => [...prev, { role: 'ai', content: 'Ошибка WebSocket соединения.', isError: true }]);
        setIsThinking(false);
        setIsExecuting(false);
    };

    ws.onclose = () => {
        setIsThinking(false);
        setIsExecuting(false);
        if (telemetryWsRef.current) telemetryWsRef.current.close();
    };

    // Connect to Telemetry service
    const telemetryUrl = `ws://localhost:8002/ws/telemetry/${activeProject.id}?ip=${droneIp}`;
    const telemetryWs = new WebSocket(telemetryUrl);
    telemetryWsRef.current = telemetryWs;
    
    telemetryWs.onmessage = (e) => {
        try {
            const tdata = JSON.parse(e.data);
            if (tdata.type === "telemetry") {
                setRealTrajectory(prev => [...prev, {x: tdata.x, y: tdata.y, z: tdata.z, yaw: tdata.yaw}]);
            } else if (tdata.type === "photo") {
                setDroneFeed(tdata.image);
            } else if (tdata.type === "thermal") {
                setThermalFeed(tdata.image);
            }
        } catch (err) {}
    };
  };

  const handleEmergencyStop = () => {
    if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ action: "stop" }));
    }
    // Small delay to ensure AI process terminates before taking control via Pioneer SDK
    setTimeout(async () => {
        try {
            await fetch(`http://localhost:8002/emergency_stop?ip=${droneIp}`, { method: 'POST' });
            setMessages(prev => [...prev, { role: 'system', content: '[SYSTEM] Экстренная остановка выполнена' }]);
        } catch (e) {
            console.error("Emergency stop error:", e);
        }
    }, 200);
  };

  const hasRoute = coordinates.length > 0;

  return (
    <div className="mission-page page-transition">
      <div className="start-grid">
        <div className="chat-container">
          <div className="chat-header--extended">
            <div className="chat-header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>Ассистент миссии</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '12px' }}>
                    <span className={`status-dot ${isExecuting ? 'executing' : (hasRoute ? 'ready' : 'planning')}`} style={{ background: isExecuting ? 'var(--color-success)' : (hasRoute ? 'var(--color-accent)' : '#aaa') }}></span>
                    <span style={{ color: isExecuting ? 'var(--color-success)' : (hasRoute ? 'var(--color-accent)' : '#aaa') }}>
                        {/* {isExecuting ? 'Режим: Полет' : (hasRoute ? 'Режим: Ожидание' : 'Режим: Планирование')} */}
                        {isExecuting ? 'Режим: Полет' : 'Режим: Планирование'}
                    </span>
                </div>
            </div>
            
            <div className="project-selector-row">
                <select 
                    className="project-select" 
                    value={activeProject?.id || ''} 
                    onChange={(e) => {
                        const p = projects.find(x => x.id === parseInt(e.target.value));
                        setActiveProject(p);
                        setMessages([{ role: 'ai', content: `Проект "${p.name}" выбран. Ожидаю указаний.` }]);
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
            
            {messages.map((msg, idx) => {
              if (msg.role === 'system' && msg.content?.startsWith('[SEPARATOR]')) {
                  const text = msg.content.replace('[SEPARATOR]', '').trim();
                  const isEnd = text.toLowerCase().includes('конец');
                  return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', margin: '20px 0', width: '100%' }}>
                          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                          <div style={{ padding: '0 15px', fontSize: '11px', color: isEnd ? 'var(--color-text-muted)' : 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>{text}</div>
                          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                      </div>
                  );
              }
              if (msg.role === 'system' && msg.content?.startsWith('[TOOL]')) {
                  const match = msg.content.match(/^\[TOOL\]\s+([\w_]+):\s+(.*)$/);
                  if (match) {
                      const toolName = match[1];
                      let toolArgs = match[2];
                      try { toolArgs = JSON.parse(toolArgs); } catch (e) {}
                      
                      return (
                        <div key={idx} className="chat-bubble-wrapper left">
                          <div className="chat-bubble chat-bubble--tool" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid var(--color-success)', color: 'var(--color-success)' }}>
                            <strong>Дрон вызывает: {toolName}</strong>
                            <pre style={{ margin: 0, fontSize: '11px', color: '#ccc' }}>{JSON.stringify(toolArgs, null, 2)}</pre>
                          </div>
                        </div>
                      );
                  }
              }
              return (
                <div key={idx} className={`chat-bubble-wrapper ${msg.role === 'user' ? 'right' : 'left'}`}>
                  <div className={`chat-bubble chat-bubble--${msg.role} ${msg.isError ? 'error-bubble' : ''}`}>
                    {msg.content}
                  </div>
                </div>
              );
            })}
            
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
              placeholder={activeProject ? "Введите команду..." : "Создайте проект для начала..."} 
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
              disabled={!activeProject || isExecuting}
            />
            <button 
              className={`btn-icon ${isRecording ? 'recording' : ''}`} 
              onClick={toggleRecording} 
              disabled={!activeProject || isThinking || isExecuting}
              title="Голосовой ввод"
            >
              <Mic size={18} />
            </button>
            <button className="btn-icon" onClick={() => {
              handleSendMessage();
              if (textareaRef.current) {
                textareaRef.current.style.height = '44px';
              }
            }} disabled={!activeProject || isThinking || !chatInput.trim() || isExecuting}>
              <Send size={18} />
            </button>
          </div>
        </div>

        <div className="map-container">
          <div className="map-view" style={{ position: 'relative' }}>
            <RouteVisualizer coordinates={coordinates} buildings={buildings} currentStep={currentStep} realTrajectory={realTrajectory} droneFeed={droneFeed} thermalFeed={thermalFeed} />
          </div>
          
          <div className="map-controls" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '15px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="mission-info" style={{ flex: 1 }}>
                  <h4>Текущая миссия</h4>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                      <p style={{ margin: 0 }}>{hasRoute ? `Точек: ${coordinates.length}` : 'Параметры не заданы'}</p>
                      {hasRoute && (
                          <input 
                              type="text" 
                              value={droneIp} 
                              onChange={(e) => setDroneIp(e.target.value)} 
                              placeholder="IP дрона" 
                              disabled={isExecuting}
                              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #444', background: '#222', color: '#fff', fontSize: '13px', width: '120px' }}
                          />
                      )}
                  </div>
                </div>
                {!isExecuting ? (
                    <button 
                    className="btn-primary start-flight-btn" 
                    onClick={handleStartRealFlight}
                    disabled={!!loadingMessage || !hasRoute || isThinking}
                    >
                    <Play size={16} />
                    {loadingMessage || 'Запустить БПЛА'}
                    </button>
                ) : (
                    <button 
                    className="btn-primary start-flight-btn" 
                    onClick={handleEmergencyStop}
                    style={{ background: '#ef4444', borderColor: '#ef4444' }}
                    >
                    Прервать полет
                    </button>
                )}
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
