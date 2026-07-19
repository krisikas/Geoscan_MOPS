import React, { useState, useEffect, useRef } from 'react';
import './ResultPage.css';
import ImageViewer from '../../components/imageViewer/imageViewer';
import AdvancedModelViewer from '../../components/imageViewer/AdvancedModelViewer';
import { Box, Image as ImageIcon, CheckCircle2, Upload, BoxSelect, Plus, X, Trash2, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, useParams } from 'react-router-dom';


const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export default function ResultPage() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const { projectId: urlProjectId } = useParams();
  
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [images, setImages] = useState({ projectId: null, ai_input: [], ai_output: [], metashape_input: [], metashape_output: [], thermal_input: [] });
  const [activeGroup, setActiveGroup] = useState('ai');
  const [showAIOutput, setShowAIOutput] = useState(false);
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
      setImages({ projectId: null, ai_input: [], ai_output: [], metashape_input: [], metashape_project: [], metashape_ai_output: [], thermal_input: [] });
      setObjectUrls(prev => {
          Object.values(prev).forEach(url => {
              try { URL.revokeObjectURL(url); } catch (e) {}
          });
          return {};
      });
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
          await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { method: 'POST' });
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
      await authFetch(`${API_BASE_URL}/api/projects/${activeProject.id}/process/${group}`, { method: 'POST' });
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
              try { URL.revokeObjectURL(prev[key]); } catch (e) {}
              const next = { ...prev };
              delete next[key];
              return next;
          }
          return prev;
      });

      if (group === 'ai_input') {
          const outKey = `${activeProject.id}_ai_output_${filename}`;
          setObjectUrls(prev => {
              if (prev[outKey]) {
                  try { URL.revokeObjectURL(prev[outKey]); } catch (e) {}
                  const next = { ...prev };
                  delete next[outKey];
                  return next;
              }
              return prev;
          });
      } else if (group === 'metashape_input') {
          const outKey = `${activeProject.id}_metashape_ai_output_${filename}`;
          setObjectUrls(prev => {
              if (prev[outKey]) {
                  try { URL.revokeObjectURL(prev[outKey]); } catch (e) {}
                  const next = { ...prev };
                  delete next[outKey];
                  return next;
              }
              return prev;
          });
      }

      fetchImages(activeProject.id);
    } catch (e) {}
  };

  const [objectUrls, setObjectUrls] = useState({});

  useEffect(() => {
    return () => {
      setObjectUrls(prev => {
        Object.values(prev).forEach(url => {
          try { URL.revokeObjectURL(url); } catch (e) {}
        });
        return {};
      });
    };
  }, []);

  useEffect(() => {
    if (!activeProject?.id || images.projectId !== activeProject.id) return;
    const currentProjectId = activeProject.id;
    
    const missingKeys = [];
    for (const group of ['ai_input', 'ai_output', 'metashape_input', 'metashape_project', 'metashape_ai_output', 'thermal_input']) {
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

  const folderKey = activeGroup === 'ai' ? 'ai_input' : (activeGroup === 'thermal' ? 'thermal_input' : (activeGroup === 'metashape' ? 'metashape_input' : 'metashape_project'));
  const currentGroupImages = activeGroup === 'ai' ? images.ai_input : (activeGroup === 'thermal' ? images.thermal_input : (activeGroup === 'metashape' ? images.metashape_input : (images.metashape_project || []).filter(img => img.toLowerCase().endsWith('.glb') || img.toLowerCase().endsWith('.gltf'))));

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

  const [isClosingModal, setIsClosingModal] = useState(false);
  const handleCloseModal = () => {
      setIsClosingModal(true);
      setTimeout(() => {
          setFullscreenImageIndex(null);
          setIsClosingModal(false);
      }, 300);
  };

  return (
    <div className="result-page page-transition">
      {errorMsg && (
        <div className="app-status-panel">
            <span className="app-status app-status--error">{errorMsg}</span>
        </div>
      )}
      {projectStatus.error && (
        <div className="app-status-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>
                <span className="app-status app-status--error" style={{ margin: 0, width: '100%' }}>{projectStatus.error}</span>
                <button onClick={() => setProjectStatus(prev => ({ ...prev, error: null }))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '0 5px' }} title="Скрыть ошибку"><X size={16} /></button>
            </div>
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
            <div key={project.id} className={`project-card ${activeProject?.id === project.id ? 'active' : ''}`} onClick={() => navigate(`/result/${project.id}`)}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <h1 className="content-title">{activeProject.name}</h1>
            
            {(activeGroup === 'metashape' || activeGroup === 'metashape_result') && projectStatus.metashape !== 'processing' && images?.metashape_input?.length > 0 && (
                <button className="process-btn" onClick={() => handleProcess('metashape')} disabled={isUploading} style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#fff', border: '1px solid rgba(255, 255, 255, 0.2)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                    <CheckCircle2 size={14} /> Собрать 3D-модель
                </button>
            )}
            
            {projectStatus.metashape === 'processing' && (
                <span style={{ fontSize: '13px', color: '#a0a0a0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div className="premium-loader" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div> 
                    Идет сборка модели...
                </span>
            )}
          </div>
          <div className="tabs">
            <button className={`tab-btn ${activeGroup === 'ai' ? 'active' : ''}`} onClick={() => setActiveGroup('ai')}>
              <ImageIcon size={18} /> Фото для ИИ
            </button>
            <button className={`tab-btn ${activeGroup === 'thermal' ? 'active' : ''}`} onClick={() => setActiveGroup('thermal')}>
              <ImageIcon size={18} /> Тепловизор
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

                <div className="gallery-grid">
                    {currentGroupImages.length > 0 ? (
                        currentGroupImages.map((img, i) => {
                            const url = objectUrls[`${activeProject.id}_${folderKey}_${img}`];
                            const isProc = isImageProcessing(img);
                            const is3DModel = img.toLowerCase().endsWith('.glb') || img.toLowerCase().endsWith('.gltf');
                            
                            return (
                            <div key={i} className={`gallery-thumbnail ${isProc ? 'processing' : ''}`} onClick={() => !isProc && !is3DModel && setFullscreenImageIndex(i)} style={{ position: 'relative', gridColumn: is3DModel ? '1 / -1' : 'auto', height: is3DModel ? '500px' : 'auto' }}>
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
                                                    setFullscreenImageIndex(i);
                                                }}
                                                style={{ position: 'absolute', top: '15px', right: '15px', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                title="Открыть в режиме просмотра"
                                            >
                                                <BoxSelect size={20} />
                                            </button>
                                        </div>
                                    ) : (
                                        <img src={url} alt={`Снимок ${i+1}`} loading="lazy" style={{ opacity: isProc ? 0.5 : 1, transition: '0.3s' }} />
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
                        <div className="gallery-empty" style={{ display: 'flex', flexDirection: 'column', gap: '15px', alignItems: 'center', padding: '60px 20px' }}>
                            <Box size={48} opacity={0.3} />
                            {projectStatus.metashape === 'processing' ? (
                                <p>Модель находится в процессе сборки...</p>
                            ) : (
                                <>
                                    <p>3D-модель еще не собрана.</p>
                                    <button className="process-btn" onClick={() => { handleProcess('metashape'); }} disabled={isUploading || !images.metashape_input?.length} style={{ padding: '12px 24px', fontSize: '16px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sparkles size={20} /> Запустить генерацию 3D-модели
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
      
      {fullscreenImageIndex !== null && (
        <div className={`fullscreen-modal ${isClosingModal ? 'closing' : ''}`} onClick={handleCloseModal}>
            <div className={`fullscreen-content ${isClosingModal ? 'closing' : ''}`} onClick={e => e.stopPropagation()}>
                <ImageViewer 
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
                />
            </div>
        </div>
      )}
    </div>
  );
}
