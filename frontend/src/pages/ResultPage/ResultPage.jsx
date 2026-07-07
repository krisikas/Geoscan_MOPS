import React, { useState, useEffect, useRef } from 'react';
import './ResultPage.css';
import ImageViewer from '../../components/imageViewer/imageViewer';
import { Box, Image as ImageIcon, CheckCircle2, Upload, BoxSelect, Plus, X, Trash2, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export default function ResultPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [images, setImages] = useState({ projectId: null, ai_input: [], ai_output: [], metashape_input: [], metashape_output: [] });
  const [activeGroup, setActiveGroup] = useState('ai');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [projectStatus, setProjectStatus] = useState({ ai: 'idle', metashape: 'idle', error: null });
  const [processingImages, setProcessingImages] = useState(new Set());
  const activeRequests = useRef(new Set());

  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const authFetch = async (url, options = {}) => {
    const res = await fetch(url, {
      ...options,
      credentials: 'include'
    });
    if (res.status === 401) { logout(); navigate('/auth'); throw new Error('Unauthorized'); }
    if (!res.ok && !options.skipError) {
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
      setImages({ projectId, ...data });
      
      const ongoing = [...(data.processing_ai || []), ...(data.processing_metashape || [])];
      if (ongoing.length > 0) {
          setProcessingImages(prev => new Set([...prev, ...ongoing]));
          ongoing.forEach(img => {
              if (!activeRequests.current.has(img)) {
                  activeRequests.current.add(img);
                  const fKey = data.processing_ai?.includes(img) ? 'ai_input' : 'metashape_input';
                  (async () => {
                      try {
                          await authFetch(`${API_BASE_URL}/api/projects/${projectId}/images/${fKey}/${img}/process_ai`, { method: 'POST' });
                          await fetchImages(projectId);
                      } finally {
                          activeRequests.current.delete(img);
                          setProcessingImages(prev => {
                              const next = new Set(prev);
                              next.delete(img);
                              return next;
                          });
                      }
                  })();
              }
          });
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (activeProject?.id) { 
      setImages({ projectId: null, ai_input: [], ai_output: [], metashape_input: [], metashape_project: [], metashape_ai_output: [] });
      setObjectUrls({});
      setProjectStatus({ 
          ai: activeProject.ai_status || 'idle', 
          metashape: activeProject.metashape_status || 'idle', 
          error: activeProject.error_message || null 
      });
      setProcessingImages(new Set());
      fetchImages(activeProject.id); 
    }
  }, [activeProject?.id]);

  useEffect(() => {
    if (!activeProject?.id) return;
    let lastStatus = { ai: 'idle', metashape: 'idle' };
    
    const eventSource = new EventSource(`${API_BASE_URL}/api/projects/${activeProject.id}/status/stream`, { withCredentials: true });
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            setProjectStatus(data);
            
            if ((data.ai === 'error' && lastStatus.ai === 'processing') || 
                (data.metashape === 'error' && lastStatus.metashape === 'processing')) {
                if (data.error) showError("Ошибка обработки: " + data.error);
            }
            if ((data.ai === 'done' && lastStatus.ai === 'processing') || 
                (data.metashape === 'done' && lastStatus.metashape === 'processing')) {
                fetchImages(activeProject.id);
            }
            lastStatus = data;
        } catch(e) {}
    };

    return () => eventSource.close();
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
      if (group === 'ai') {
          await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { method: 'POST' });
      }
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

  const handleDeleteImage = async (filename, group) => {
    if (!window.confirm('Удалить это фото?')) return;
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${group}/${filename}`, { method: 'DELETE' });
      fetchImages(activeProject.id);
    } catch (e) {}
  };

  const handleProcessSingle = async (filename, group) => {
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${group}/${filename}/process_ai`, { method: 'POST' });
      fetchImages(activeProject.id);
    } catch (e) {}
  };

  const getImageUrl = (group, filename) => {
    // With HttpOnly cookies, we can just use the URL directly in <img src>
  };

  const [objectUrls, setObjectUrls] = useState({});

  useEffect(() => {
    if (!activeProject?.id || images.projectId !== activeProject.id) return;
    const currentProjectId = activeProject.id;
    
    const missingKeys = [];
    for (const group of ['ai_input', 'ai_output', 'metashape_input', 'metashape_project', 'metashape_ai_output']) {
        for (const img of images[group] || []) {
            const key = `${currentProjectId}_${group}_${img}`;
            if (!objectUrls[key]) {
                missingKeys.push({ group, img, key });
            }
        }
    }
    
    if (missingKeys.length === 0) return;

    const fetchMissing = async () => {
        const newUrls = {};
        let changed = false;
        for (const { group, img, key } of missingKeys) {
            try {
                const res = await authFetch(`${API_BASE_URL}/api/projects/${currentProjectId}/images/${group}/${img}`);
                if (res.ok) {
                    const blob = await res.blob();
                    newUrls[key] = URL.createObjectURL(blob);
                    changed = true;
                }
            } catch(e) {}
        }
        if (changed) {
            setObjectUrls(prev => ({ ...prev, ...newUrls }));
        }
    };
    
    fetchMissing();
  }, [images, activeProject?.id, objectUrls]);

  const handleForceRefetch = async (img, folder) => {
      try {
          const res = await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${folder}/${img}`);
          if (res.ok) {
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              setObjectUrls(prev => ({ ...prev, [`${activeProject.id}_${folder}_${img}`]: url }));
          }
      } catch (e) {}
  };

  const currentGroupImages = activeGroup === 'ai' 
      ? images.ai_input 
      : (activeGroup === 'metashape' ? images.metashape_input : images.metashape_project);
      
  const folderKey = activeGroup === 'ai' 
      ? 'ai_input' 
      : (activeGroup === 'metashape' ? 'metashape_input' : 'metashape_project');

  const isImageProcessing = (img) => {
      if (processingImages.has(img)) return true;
      if (activeGroup === 'ai' && projectStatus.ai === 'processing' && !images.ai_output.includes(img)) return true;
      return false;
  };

  const startSingleProcess = async (img) => {
      setProcessingImages(prev => new Set(prev).add(img));
      try {
          await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${folderKey}/${img}/process_ai`, { method: 'POST' });
          await fetchImages(activeProject.id);
      } finally {
          setProcessingImages(prev => {
              const next = new Set(prev);
              next.delete(img);
              return next;
          });
      }
  };

  return (
    <div className="result-page page-transition">
      {errorMsg && (
        <div className="app-status-panel">
            <span className="app-status app-status--error">{errorMsg}</span>
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
            <input type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUpload(e.target.files, 'metashape')} />
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
                <div className="gallery-header-status" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
                    <div className="status-banners" style={{ flex: 1 }}>
                        {projectStatus.ai === 'processing' && activeGroup === 'ai' && (
                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.1)', padding: '8px 16px', borderRadius: '12px', fontSize: '13px' }}>
                                <Sparkles className="rotating" size={16} /> Идет пакетная обработка нейросетью...
                            </div>
                        )}
                        {projectStatus.metashape === 'processing' && activeGroup === 'metashape' && (
                            <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', background: 'rgba(255, 255, 255, 0.1)', padding: '8px 16px', borderRadius: '12px', fontSize: '13px' }}>
                                <BoxSelect className="rotating" size={16} /> Сборка фотограмметрической модели...
                            </div>
                        )}
                    </div>
                    <div>
                        {activeGroup === 'metashape' && projectStatus.metashape !== 'processing' && currentGroupImages.length > 0 && (
                            <button className="process-btn" onClick={() => handleProcess('metashape')} disabled={isUploading} style={{ background: 'rgba(255, 255, 255, 0.1) !important', color: '#fff !important', border: '1px solid rgba(255, 255, 255, 0.2)' }}>
                                <CheckCircle2 size={16} /> Собрать модель
                            </button>
                        )}
                    </div>
                </div>

                <div className="gallery-grid">
                {currentGroupImages.length > 0 ? (
                    currentGroupImages.map((img, i) => {
                        const url = objectUrls[`${activeProject.id}_${folderKey}_${img}`];
                        const isProc = isImageProcessing(img);
                        return (
                        <div key={i} className={`gallery-thumbnail ${isProc ? 'processing' : ''}`} onClick={() => !isProc && setFullscreenImageIndex(i)} style={{ position: 'relative' }}>
                            {url ? <img src={url} alt={`Снимок ${i+1}`} loading="lazy" style={{ opacity: isProc ? 0.5 : 1, transition: '0.3s' }} /> : <div className="loading-placeholder">Загрузка...</div>}
                            
                            {isProc && (
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
                                    <Sparkles className="rotating" size={32} style={{ color: '#fff' }} />
                                </div>
                            )}

                            {!isProc && (
                                <div className="thumbnail-actions" onClick={e => e.stopPropagation()}>
                                    <button className="action-btn delete" title="Удалить" onClick={(e) => { e.stopPropagation(); handleDeleteImage(img, folderKey); }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            )}
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
      
      {fullscreenImageIndex !== null && (
        <div className="fullscreen-modal" onClick={() => setFullscreenImageIndex(null)}>
            <div className="fullscreen-close" onClick={() => setFullscreenImageIndex(null)}><X size={24}/></div>
            <div className="fullscreen-content" onClick={e => e.stopPropagation()}>
                <ImageViewer 
                    globalImages={images}
                    images={currentGroupImages}
                    currentIndex={fullscreenImageIndex}
                    onNavigate={(dir) => {
                        let next = fullscreenImageIndex + dir;
                        while (next >= 0 && next < currentGroupImages.length) {
                            if (!isImageProcessing(currentGroupImages[next])) {
                                setFullscreenImageIndex(next);
                                return;
                            }
                            next += dir;
                        }
                    }}
                    onClose={() => setFullscreenImageIndex(null)}
                    folderKey={folderKey}
                    projectId={activeProject.id}
                    objectUrls={objectUrls}
                    startSingleProcess={startSingleProcess}
                />
            </div>
        </div>
      )}
    </div>
  );
}
