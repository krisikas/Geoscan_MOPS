import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './ResultPage.css';
import ImageViewer from '../../components/imageViewer/imageViewer';
import AdvancedModelViewer from '../../components/imageViewer/AdvancedModelViewer';
import { Box, Image as ImageIcon, CheckCircle2, Upload, BoxSelect, Plus, X, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export default function ResultPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [images, setImages] = useState({ projectId: null, ai_input: [], ai_output_yolo: [], ai_output_cracksam: [], metashape_input: [], metashape_output: [], metashape_ai_output_yolo: [], metashape_ai_output_cracksam: [], thermal_input: [] });
  const [activeGroup, setActiveGroup] = useState('ai');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [fullscreenImageIndex, setFullscreenImageIndex] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedAIModels] = useState(['yolo']);
  const [errorMsg, setErrorMsg] = useState(null);
  const [projectStatus, setProjectStatus] = useState({ ai: 'idle', metashape: 'idle', error: null });
  const [processingImages, setProcessingImages] = useState(new Set());
  const activeRequests = useRef(new Set());
  const tabsRef = useRef(null);
  const viewerTriggerRef = useRef(null);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const revealSelectedTab = () => {
      const selected = tabs.querySelector('[aria-pressed="true"]');
      if (!selected) return;
      const bounds = tabs.getBoundingClientRect();
      const item = selected.getBoundingClientRect();
      const delta = item.right > bounds.right ? item.right - bounds.right + 4
        : item.left < bounds.left ? item.left - bounds.left - 4 : 0;
      if (delta) tabs.scrollBy({ left: delta, behavior: 'auto' });
    };
    revealSelectedTab();
    const observer = new ResizeObserver(revealSelectedTab);
    observer.observe(tabs);
    return () => observer.disconnect();
  }, [activeGroup, activeProject?.id]);

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
        try { const data = await res.json(); msg = data.detail || msg; } catch { /* Ignore optional cleanup or malformed stream data. */ }
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
      if (data.length > 0 && !urlProjectId) {
          navigate(`/result/${data[0].id}`, { replace: true });
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchProjects(); }, []);

  useEffect(() => {
      if (projects.length > 0) {
          if (urlProjectId) {
              const proj = projects.find(p => p.id === parseInt(urlProjectId));
              if (proj && proj.id !== activeProject?.id) {
                  setActiveProject(proj);
              }
          } else if (!activeProject) {
              navigate(`/result/${projects[0].id}`, { replace: true });
          }
      }
  }, [urlProjectId, projects]);

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
                          await authFetch(`${API_BASE_URL}/api/projects/${projectId}/images/${fKey}/${img}/process_ai`, { 
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ models: selectedAIModels })
                          });
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
      setImages({ projectId: null, ai_input: [], ai_output_yolo: [], ai_output_cracksam: [], metashape_input: [], metashape_project: [], metashape_ai_output_yolo: [], metashape_ai_output_cracksam: [], thermal_input: [] });
      setObjectUrls(prev => {
          Object.values(prev).forEach(url => {
              try { URL.revokeObjectURL(url); } catch { /* Ignore optional cleanup or malformed stream data. */ }
          });
          return {};
      });
      setProjectStatus({ 
          ai: activeProject.ai_status || 'idle', 
          ai_models: activeProject.ai_models || [],
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
        } catch { /* Ignore optional cleanup or malformed stream data. */ }
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
      navigate(`/result/${proj.id}`);
      setIsCreatingProject(false);
      setNewProjectName('');
    } catch (e) { console.error(e); }
  };

  const handleDeleteProject = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Точно удалить проект?')) return;
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${id}`, { method: 'DELETE' });
      const newProjects = projects.filter(p => p.id !== id);
      setProjects(newProjects);
      if (activeProject?.id === id) {
          if (newProjects.length > 0) {
              navigate(`/result/${newProjects[0].id}`);
          } else {
              setActiveProject(null);
              navigate(`/result`);
          }
      }
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
          await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ models: selectedAIModels })
          });
      }
      fetchImages(activeProject.id);
    } catch (e) { console.error(e); }
    setIsUploading(false);
  };
  
  const handleProcess = async (group) => {
    if (!activeProject) return;
    setIsUploading(true);
    // Optimistically clear the error and set status to processing so the UI updates IMMEDIATELY
    setProjectStatus(prev => ({ ...prev, [group]: 'processing', error: null }));
    
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { 
          method: 'POST',
          headers: group === 'ai' ? { 'Content-Type': 'application/json' } : undefined,
          body: group === 'ai' ? JSON.stringify({ models: selectedAIModels }) : undefined
      });
      fetchImages(activeProject.id);
    } catch (e) { 
        console.error(e); 
        setProjectStatus(prev => ({ ...prev, [group]: 'error', error: e.message }));
    }
    setIsUploading(false);
  };

  const handleDeleteImage = async (filename, group) => {
    if (!window.confirm('Удалить это фото?')) return;
    try {
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${group}/${filename}`, { method: 'DELETE' });
      
      const key = `${activeProject.id}_${group}_${filename}`;
      setObjectUrls(prev => {
          if (prev[key]) {
              try { URL.revokeObjectURL(prev[key]); } catch { /* Ignore optional cleanup or malformed stream data. */ }
              const next = { ...prev };
              delete next[key];
              return next;
          }
          return prev;
      });

      if (group === 'ai_input') {
          const outKeyYolo = `${activeProject.id}_ai_output_yolo_${filename.replace(/\.[^/.]+$/, ".png")}`;
          const outKeyCrack = `${activeProject.id}_ai_output_cracksam_${filename.replace(/\.[^/.]+$/, ".png")}`;
          setObjectUrls(prev => {
              const next = { ...prev };
              if (next[outKeyYolo]) { try { URL.revokeObjectURL(next[outKeyYolo]); } catch { /* Ignore optional cleanup or malformed stream data. */ } delete next[outKeyYolo]; }
              if (next[outKeyCrack]) { try { URL.revokeObjectURL(next[outKeyCrack]); } catch { /* Ignore optional cleanup or malformed stream data. */ } delete next[outKeyCrack]; }
              return next;
          });
      } else if (group === 'metashape_input') {
          const outKeyYolo = `${activeProject.id}_metashape_ai_output_yolo_${filename.replace(/\.[^/.]+$/, ".png")}`;
          const outKeyCrack = `${activeProject.id}_metashape_ai_output_cracksam_${filename.replace(/\.[^/.]+$/, ".png")}`;
          setObjectUrls(prev => {
              const next = { ...prev };
              if (next[outKeyYolo]) { try { URL.revokeObjectURL(next[outKeyYolo]); } catch { /* Ignore optional cleanup or malformed stream data. */ } delete next[outKeyYolo]; }
              if (next[outKeyCrack]) { try { URL.revokeObjectURL(next[outKeyCrack]); } catch { /* Ignore optional cleanup or malformed stream data. */ } delete next[outKeyCrack]; }
              return next;
          });
      }

      fetchImages(activeProject.id);
    } catch { /* Ignore optional cleanup or malformed stream data. */ }
  };

  const [objectUrls, setObjectUrls] = useState({});

  useEffect(() => {
    return () => {
      setObjectUrls(prev => {
        Object.values(prev).forEach(url => {
          try { URL.revokeObjectURL(url); } catch { /* Ignore optional cleanup or malformed stream data. */ }
        });
        return {};
      });
    };
  }, []);

  useEffect(() => {
    if (!activeProject?.id || images.projectId !== activeProject.id) return;
    const currentProjectId = activeProject.id;
    
    const missingKeys = [];
    for (const group of ['ai_input', 'ai_output_yolo', 'ai_output_cracksam', 'metashape_input', 'metashape_project', 'metashape_ai_output_yolo', 'metashape_ai_output_cracksam', 'thermal_input']) {
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
                const res = await authFetch(`${API_BASE_URL}/api/projects/${currentProjectId}/images/${group}/${img}?t=${Date.now()}`);
                if (res.ok) {
                    const blob = await res.blob();
                    newUrls[key] = URL.createObjectURL(blob);
                    changed = true;
                }
            } catch { /* Ignore optional cleanup or malformed stream data. */ }
        }
        if (changed) {
            setObjectUrls(prev => ({ ...prev, ...newUrls }));
        }
    };
    
    fetchMissing();
  }, [images, activeProject?.id, objectUrls]);

  const isViewerOpen = fullscreenImageIndex !== null;
  useEffect(() => {
    if (!isViewerOpen) return;
    const root = document.getElementById('root');
    const previousInert = root?.inert;
    const previousOverflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    return () => {
      if (root) root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      viewerTriggerRef.current?.focus();
    };
  }, [isViewerOpen]);

  const folderKey = activeGroup === 'ai' ? 'ai_input' : (activeGroup === 'thermal' ? 'thermal_input' : (activeGroup === 'metashape' ? 'metashape_input' : 'metashape_project'));
  const currentGroupImages = activeGroup === 'ai' ? images.ai_input : (activeGroup === 'thermal' ? images.thermal_input : (activeGroup === 'metashape' ? images.metashape_input : (images.metashape_project || []).filter(img => img.toLowerCase().endsWith('.glb') || img.toLowerCase().endsWith('.gltf'))));

  const isImageProcessing = (img) => {
      if (processingImages.has(img)) return true;
      if (activeGroup === 'ai' && projectStatus.ai === 'processing') {
          const modelsToCheck = projectStatus.ai_models?.length ? projectStatus.ai_models : ['yolo'];
          const baseName = img.substring(0, img.lastIndexOf('.')) || img;
          const outName = baseName + '.png';
          
          const hasAllOutputs = modelsToCheck.every(model => {
              const outputList = images[`ai_output_${model}`];
              return outputList && outputList.includes(outName);
          });
          
          if (!hasAllOutputs) return true;
      }
      return false;
  };

  const startSingleProcess = async (img, modelsToRun = ['yolo']) => {
      setProcessingImages(prev => new Set(prev).add(img));
      try {
          await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/images/${folderKey}/${img}/process_ai`, { 
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ models: modelsToRun })
          });
          
          const maskImgName = img.replace(/\.[^/.]+$/, ".png");
          setObjectUrls(prev => {
              const next = { ...prev };
              for (const model of modelsToRun) {
                  const outGroup = folderKey === 'ai_input' ? `ai_output_${model}` : `metashape_ai_output_${model}`;
                  const key = `${activeProject.id}_${outGroup}_${maskImgName}`;
                  if (next[key]) {
                      try { URL.revokeObjectURL(next[key]); } catch { /* Ignore optional cleanup or malformed stream data. */ }
                      delete next[key];
                  }
              }
              return next;
          });
          
          await fetchImages(activeProject.id);
      } finally {
          setProcessingImages(prev => {
              const next = new Set(prev);
              next.delete(img);
              return next;
          });
      }
  };

  const [isClosingModal, setIsClosingModal] = useState(false);
  const openViewer = (index) => {
      viewerTriggerRef.current = document.activeElement;
      setFullscreenImageIndex(index);
  };
  const handleCloseModal = () => {
      setIsClosingModal(true);
      setTimeout(() => {
          setFullscreenImageIndex(null);
          setIsClosingModal(false);
      }, 300);
  };

  const showMetashapeAction = (activeGroup === 'metashape' || activeGroup === 'metashape_result')
    && projectStatus.metashape !== 'processing'
    && images.metashape_input?.length > 0
    && !(activeGroup === 'metashape_result' && currentGroupImages.length === 0);

  return (
    <div className="result-page page-transition">
      <div className="projects-sidebar">
        <div className="sidebar-header-row">
            <h2 className="sidebar-title">Проекты</h2>
            <button className="result-icon-button" title="Создать проект" aria-label="Создать проект" aria-expanded={isCreatingProject} onClick={() => setIsCreatingProject(!isCreatingProject)}>
                <Plus size={16}/>
            </button>
        </div>
        
        {isCreatingProject && (
            <div className="result-create-project">
                <input type="text" aria-label="Имя проекта" placeholder="Имя проекта" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} />
                <button onClick={handleCreateProject}>Создать</button>
            </div>
        )}

        <div className="projects-list">
          {projects.map(project => (
            <div key={project.id} className={`project-card ${activeProject?.id === project.id ? 'active' : ''}`} onClick={() => navigate(`/result/${project.id}`)}>
              <div className="project-header">
                <h3><button className="project-select-button" onClick={() => navigate(`/result/${project.id}`)} aria-current={activeProject?.id === project.id ? 'true' : undefined}>{project.name}</button></h3>
                <button className="delete-btn" aria-label={`Удалить проект «${project.name}»`} onClick={(e) => handleDeleteProject(project.id, e)}><Trash2 size={14}/></button>
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
            <Upload size={16} /> Снимки Metashape
            <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(e.target.files, 'metashape')} />
          </label>
          <label className="upload-btn secondary">
            <ImageIcon size={16} /> Фото для ИИ
            <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(e.target.files, 'ai')} />
          </label>
        </div>
        )}
      </div>

      <div className="project-content">
      {errorMsg && errorMsg !== projectStatus.error && (
        <div className="result-notice" role="alert">
            <span className="app-status app-status--error">{errorMsg}</span>
        </div>
      )}
      {projectStatus.error && (
        <div className="result-notice" role="alert">
            <div className="app-status-error-container">
                <span className="app-status app-status--error">{projectStatus.error}</span>
                <button onClick={() => setProjectStatus(prev => ({ ...prev, error: null }))} className="app-status-close-btn" title="Скрыть ошибку"><X size={16} /></button>
            </div>
        </div>
      )}

        {!activeProject ? (
            <div className="placeholder-3d"><BoxSelect size={48} className="placeholder-icon"/><p>Выберите проект слева</p></div>
        ) : (
        <>
        <header className="content-header">
          <div className="content-heading">
            <h1 className="content-title">{activeProject.name}</h1>
            
            <div className="content-heading-action">
                <button
                    className={`metashape-button metashape-button--secondary ${showMetashapeAction ? '' : 'metashape-button--placeholder'}`}
                    onClick={() => handleProcess('metashape')}
                    disabled={isUploading || !showMetashapeAction}
                    aria-hidden={!showMetashapeAction}
                    tabIndex={showMetashapeAction ? 0 : -1}
                >
                    <Box size={16} /> Собрать 3D-модель
                </button>
                {projectStatus.metashape === 'processing' && (
                <span className="metashape-progress" role="status">
                    <span className="premium-loader" aria-hidden="true"></span>
                    Идет сборка модели...
                </span>
                )}
            </div>
          </div>
          <div ref={tabsRef} className="tabs" role="group" aria-label="Разделы результатов">
            <button className={`tab-btn ${activeGroup === 'ai' ? 'active' : ''}`} aria-pressed={activeGroup === 'ai'} onClick={() => setActiveGroup('ai')}>
              <ImageIcon size={18} /> Фото для ИИ
            </button>
            <button className={`tab-btn ${activeGroup === 'thermal' ? 'active' : ''}`} aria-pressed={activeGroup === 'thermal'} onClick={() => setActiveGroup('thermal')}>
              <ImageIcon size={18} /> Тепловизор
            </button>
            <button className={`tab-btn ${activeGroup === 'metashape' ? 'active' : ''}`} aria-pressed={activeGroup === 'metashape'} onClick={() => setActiveGroup('metashape')}>
              <Box size={18} /> Исходники Metashape
            </button>
            <button className={`tab-btn ${activeGroup === 'metashape_result' ? 'active' : ''}`} aria-pressed={activeGroup === 'metashape_result'} onClick={() => setActiveGroup('metashape_result')}>
              <CheckCircle2 size={18} /> Результаты Metashape
            </button>
          </div>
        </header>

        <div className="content-body">
            <div className="gallery-panel">

                <div className="gallery-grid">
                    {currentGroupImages.length > 0 ? (
                        currentGroupImages.map((img, i) => {
                            const url = objectUrls[`${activeProject.id}_${folderKey}_${img}`];
                            const isProc = isImageProcessing(img);
                            const is3DModel = img.toLowerCase().endsWith('.glb') || img.toLowerCase().endsWith('.gltf');
                            
                            return (
                            <div key={i} className={`gallery-thumbnail ${isProc ? 'processing' : ''} ${is3DModel ? 'gallery-thumbnail--model' : ''}`} onClick={() => !isProc && !is3DModel && openViewer(i)}>
                                {url ? (
                                    is3DModel ? (
                                        <div style={{ width: '100%', height: '100%', position: 'relative', borderRadius: '12px', overflow: 'hidden' }} id={`model-container-${i}`}>
                                            <AdvancedModelViewer 
                                                src={url} 
                                                rotationFix={true}
                                            />
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openViewer(i);
                                                }}
                                                style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="Открыть в режиме просмотра"
                                            >
                                                <BoxSelect size={20} />
                                            </button>
                                        </div>
                                    ) : (
                                      <>
                                        <button className="gallery-open" disabled={isProc} aria-label={`Открыть снимок ${i + 1}`} />
                                        <img src={url} alt={`Снимок ${i+1}`} loading="lazy" style={{ opacity: isProc ? 0.5 : 1, transition: '0.3s' }} />
                                      </>
                                    )
                                ) : <div className="loading-placeholder">Загрузка...</div>}
                                
                                {isProc && (
                                    <div className="thumbnail-processing-overlay">
                                        <div className="premium-loader" style={{ width: '28px', height: '28px', borderWidth: '2px' }}></div>
                                    </div>
                                )}

                            {!isProc && !is3DModel && (
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
                    activeGroup === 'metashape_result' ? (
                        <div className="gallery-empty model-empty">
                            <Box size={48} opacity={0.3} />
                            {projectStatus.metashape === 'processing' ? (
                                <p>Модель находится в процессе сборки...</p>
                            ) : (
                                <>
                                    <p>{projectStatus.metashape === 'error' ? 'Не удалось собрать 3D-модель.' : '3D-модель еще не собрана.'}</p>
                                    {!images.metashape_input?.length && <p className="model-empty-hint">Загрузите исходные снимки через панель слева.</p>}
                                    <button className="metashape-button metashape-button--primary" onClick={() => { handleProcess('metashape'); }} disabled={isUploading || !images.metashape_input?.length}>
                                        <Box size={18} /> Собрать 3D-модель
                                    </button>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="gallery-empty">В этой группе пока нет фотографий. Загрузите их через панель слева.</div>
                    )
                )}
                </div>
            </div>
        </div>
        </>
        )}
      </div>
      
      {fullscreenImageIndex !== null && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Просмотр результата" className={`fullscreen-modal ${isClosingModal ? 'closing' : ''}`} onClick={handleCloseModal}>
            <div className={`fullscreen-content ${isClosingModal ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
                <ImageViewer 
                    key={`${activeProject.id}_${folderKey}`}
                    globalImages={images}
                    images={currentGroupImages}
                    currentIndex={fullscreenImageIndex}
                    onNavigate={(dir) => {
                        let next = fullscreenImageIndex + dir;
                        if (next >= 0 && next < currentGroupImages.length) {
                          setFullscreenImageIndex(next);
                        }
                    }}
                    onClose={handleCloseModal}
                    folderKey={folderKey}
                    projectId={activeProject.id}
                    objectUrls={objectUrls}
                    startSingleProcess={startSingleProcess}
                    aiModels={projectStatus.ai_models?.length ? projectStatus.ai_models : selectedAIModels}
                />
            </div>
        </div>, document.body
      )}
    </div>
  );
}
