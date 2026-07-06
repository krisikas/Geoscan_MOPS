import React, { useState, useEffect } from 'react';
import './ResultPage.css';
import ImageViewer from '../../components/imageViewer/imageViewer';
import { Box, Image as ImageIcon, CheckCircle2, Upload, BoxSelect, Plus, X, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export default function ResultPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [images, setImages] = useState({ ai_input: [], ai_output: [], metashape_input: [], metashape_output: [] });
  const [activeGroup, setActiveGroup] = useState('ai'); // 'ai' | 'metashape'
  const [showAIOutput, setShowAIOutput] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [projectStatus, setProjectStatus] = useState({ ai: 'idle', metashape: 'idle', error: null });

  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const authFetch = async (url, options = {}) => {
    const token = localStorage.getItem('mops_token');
    const res = await fetch(url, {
      ...options,
      headers: { ...options.headers, 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401) { logout(); navigate('/auth'); throw new Error('Unauthorized'); }
    if (!res.ok) {
        let msg = 'Ошибка сервера';
        try { const data = await res.json(); msg = data.detail || msg; } catch(e) {}
        showError(msg);
        throw new Error(msg);
    }
    return res;
  };

  const fetchProjects = async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/`);
      const data = await res.json();
      setProjects(data);
      if (data.length > 0 && !activeProject) setActiveProject(data[0]);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchProjects(); }, []);

  const fetchImages = async (projectId) => {
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/${projectId}/images`);
      const data = await res.json();
      setImages(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeProject?.id) { 
      setImages({ ai_input: [], ai_output: [], metashape_input: [], metashape_output: [] });
      setObjectUrls({});
      setProjectStatus({ ai: 'idle', metashape: 'idle', error: null });
      fetchImages(activeProject.id); 
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id) return;
    let lastStatus = { ai: 'idle', metashape: 'idle' };
    const interval = setInterval(async () => {
        try {
            const res = await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/status`);
            const data = await res.json();
            setProjectStatus(data);
            
            if (data.error && data.error !== lastStatus.error) {
                showError("Ошибка обработки: " + data.error);
            }
            if ((data.ai === 'done' && lastStatus.ai === 'processing') || 
                (data.metashape === 'done' && lastStatus.metashape === 'processing')) {
                fetchImages(activeProject.id);
            }
            lastStatus = data;
        } catch(e) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [activeProject?.id]);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      const res = await authFetch(`${API_BASE_URL}/api/projects/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName })
      });
      const proj = await res.json();
      setProjects([proj, ...projects]);
      setActiveProject(proj);
      setIsCreatingProject(false);
      setNewProjectName('');
    } catch (e) { console.error(e); }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Точно удалить проект?')) return;
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${id}`, { method: 'DELETE' });
      setProjects(projects.filter(p => p.id !== id));
      if (activeProject?.id === id) setActiveProject(null);
    } catch (e) { console.error(e); }
  };

  const handleUpload = async (files, group) => {
    if (!activeProject || files.length === 0) return;
    setIsUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('files', f));
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/upload/${group}`, {
        method: 'POST', body: formData
      });
      // Автоматически запускаем обработку после успешной загрузки
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { method: 'POST' });
      fetchImages(activeProject.id);
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };
  
  const handleProcess = async (group) => {
    if (!activeProject) return;
    setIsUploading(true);
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { method: 'POST' });
      fetchImages(activeProject.id);
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };

  const getImageUrl = (group, filename) => {
    const token = localStorage.getItem('mops_token');
    // Using simple approach by passing token via query param or fetching as blob
    // For simplicity in UI since img tag can't send headers easily: 
    // We will just fetch the blob and create Object URL
  };

  const [objectUrls, setObjectUrls] = useState({});

  useEffect(() => {
    // Generate object URLs for images efficiently
    const loadImages = async () => {
        const urls = { ...objectUrls };
        let changed = false;
        for (const group of ['ai_input', 'ai_output', 'metashape_input', 'metashape_output']) {
            for (const img of images[group] || []) {
                const key = `${group}_${img}`;
                if (!urls[key]) {
                    try {
                        const res = await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${group}/${img}`);
                        const blob = await res.blob();
                        urls[key] = URL.createObjectURL(blob);
                        changed = true;
                    } catch(e) {}
                }
            }
        }
        if (changed) setObjectUrls(urls);
    };
    if (activeProject?.id) loadImages();
  }, [images, activeProject?.id]);

  const currentGroupImages = activeGroup === 'ai' 
    ? (showAIOutput ? images.ai_output : images.ai_input)
    : (activeGroup === 'metashape' ? images.metashape_input : images.metashape_output);
    
  const currentGroupLabel = activeGroup === 'ai' ? 'ai' : 'metashape';
  const folderKey = activeGroup === 'ai' 
    ? (showAIOutput ? 'ai_output' : 'ai_input')
    : (activeGroup === 'metashape' ? 'metashape_input' : 'metashape_output');

  return (
    <div className="result-page page-transition">
      {errorMsg && (
        <div style={{ position:'fixed', top:'20px', left:'50%', transform:'translateX(-50%)', background:'#ef4444', color:'#fff', padding:'12px 24px', borderRadius:'8px', zIndex:10000, boxShadow:'0 4px 12px rgba(239,68,68,0.3)', fontWeight:'500' }}>
            {errorMsg}
        </div>
      )}
      <div className="projects-sidebar">
        <div className="sidebar-header-row">
            <h2 className="sidebar-title">Проекты</h2>
            <button className="btn-icon-small" onClick={() => setIsCreatingProject(!isCreatingProject)}>
                <Plus size={16}/>
            </button>
        </div>
        
        {isCreatingProject && (
            <div className="create-project-form">
                <input type="text" placeholder="Имя проекта" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                <button onClick={handleCreateProject}>Создать</button>
            </div>
        )}

        <div className="projects-list">
          {projects.map(project => (
            <div key={project.id} className={`project-card ${activeProject?.id === project.id ? 'active' : ''}`} onClick={() => setActiveProject(project)}>
              <div className="project-header">
                <h3>{project.name}</h3>
                <button className="delete-btn" onClick={(e) => handleDeleteProject(project.id, e)}><Trash2 size={14}/></button>
              </div>
              <div className="project-meta">
                <span>{new Date(project.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
          {projects.length === 0 && <p className="gallery-empty" style={{padding: '20px', fontSize:'13px'}}>Нет проектов</p>}
        </div>

        {activeProject && (
        <div className="upload-section">
          <label className="upload-btn primary">
            <Upload size={16} /> Metashape загрузка
            <input type="file" webkitdirectory="true" directory="true" multiple style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files, 'metashape')} />
          </label>
          <label className="upload-btn secondary">
            <ImageIcon size={16} /> Одиночные для ИИ
            <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files, 'ai')} />
          </label>
        </div>
        )}
      </div>

      <div className="project-content">
        {!activeProject ? (
            <div className="placeholder-3d"><BoxSelect size={48} className="placeholder-icon"/><p>Выберите проект слева</p></div>
        ) : (
        <>
        <header className="content-header">
          <div>
            <h1 className="content-title">{activeProject.name}</h1>
          </div>
          <div className="tabs">
            <button className={`tab-btn ${activeGroup === 'ai' ? 'active' : ''}`} onClick={() => setActiveGroup('ai')}>
              <ImageIcon size={18} /> Фото для ИИ
            </button>
            <button className={`tab-btn ${activeGroup === 'metashape' ? 'active' : ''}`} onClick={() => setActiveGroup('metashape')}>
              <Box size={18} /> Исходники Metashape
            </button>
            <button className={`tab-btn ${activeGroup === 'metashape_result' ? 'active' : ''}`} onClick={() => setActiveGroup('metashape_result')}>
              <CheckCircle2 size={18} /> Результаты Metashape
            </button>
          </div>
        </header>

        <div className="content-body">
            <div className="gallery-panel">
                <div className="gallery-toolbar" style={{ justifyContent: 'space-between', opacity: activeGroup === 'ai' ? 1 : 0, pointerEvents: activeGroup === 'ai' ? 'auto' : 'none' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
                        <span className="toolbar-label">Результат обработки:</span>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={showAIOutput} onChange={() => setShowAIOutput(!showAIOutput)} />
                            <span className="toggle-slider"></span>
                        </label>
                        <span className="toolbar-status">{showAIOutput ? 'Показан' : 'Исходники'}</span>
                    </div>
                </div>

                <div className="gallery-grid">
                {((activeGroup === 'ai' && projectStatus.ai === 'processing') || 
                  (activeGroup !== 'ai' && projectStatus.metashape === 'processing')) ? (
                    <div className="gallery-empty" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ marginBottom: '16px' }}><BoxSelect size={32} className="placeholder-icon rotating" /></div>
                        Обработка на сервере в фоновом режиме... Можете закрыть страницу или выбрать другой проект.
                    </div>
                ) : currentGroupImages.length > 0 ? (
                    currentGroupImages.map((img, i) => {
                        const url = objectUrls[`${folderKey}_${img}`];
                        return (
                        <div key={i} className="gallery-thumbnail" onClick={() => setFullscreenImage(url)}>
                            {url ? <img src={url} alt={`Снимок ${i+1}`} loading="lazy" /> : <div className="loading-placeholder">Загрузка...</div>}
                        </div>
                        )
                    })
                ) : (
                    <div className="gallery-empty">В этой группе пока нет фотографий. Загрузите их через панель слева.</div>
                )}
                </div>
            </div>
        </div>
        </>
        )}
      </div>
      
      {fullscreenImage && (
        <div className="fullscreen-modal" onClick={() => setFullscreenImage(null)}>
            <div className="fullscreen-close" onClick={() => setFullscreenImage(null)}><X size={24}/></div>
            <div className="fullscreen-content" onClick={e => e.stopPropagation()}>
                <ImageViewer imageSrc={fullscreenImage} />
            </div>
        </div>
      )}
    </div>
  );
}
