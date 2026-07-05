import React, { useState } from 'react';
import './ResultPage.css';
import ImageViewer from '../../components/imageViewer/imageViewer';
import { Box, Image as ImageIcon, CheckCircle2, Upload, BoxSelect } from 'lucide-react';

const DUMMY_PROJECTS = [
  { id: 1, name: 'Бизнес-центр "Высота"', date: '12.05.2026', status: 'completed', imageCount: 142 },
  { id: 2, name: 'ЖК "Горизонт", корпус 3', date: '08.05.2026', status: 'completed', imageCount: 256 },
  { id: 3, name: 'Промышленный склад №4', date: '01.05.2026', status: 'processing', imageCount: 89 },
];

export default function ResultPage({ 
  imageUrl, 
  onUploadFolderForMetashape, 
  onUploadSingleForAI
}) {
  const [activeProject, setActiveProject] = useState(DUMMY_PROJECTS[0]);
  const [showDefects, setShowDefects] = useState(true);
  const [activeTab, setActiveTab] = useState('3d'); // '3d' | 'gallery'

  const handleToggleDefects = () => setShowDefects(!showDefects);

  const galleryItems = imageUrl ? [imageUrl, imageUrl, imageUrl, imageUrl, imageUrl] : [];

  return (
    <div className="result-page page-transition">
      <div className="projects-sidebar">
        <h2 className="sidebar-title">Проекты сканирования</h2>
        <div className="projects-list">
          {DUMMY_PROJECTS.map(project => (
            <div 
              key={project.id} 
              className={`project-card ${activeProject.id === project.id ? 'active' : ''}`}
              onClick={() => setActiveProject(project)}
            >
              <div className="project-header">
                <h3>{project.name}</h3>
                {project.status === 'completed' ? (
                  <CheckCircle2 size={16} className="text-success" />
                ) : (
                  <span className="status-badge processing">В обработке</span>
                )}
              </div>
              <div className="project-meta">
                <span>{project.date}</span>
                <span>•</span>
                <span>{project.imageCount} фото</span>
              </div>
            </div>
          ))}
        </div>

        <div className="upload-section">
          <label className="upload-btn primary">
            <Upload size={16} />
            Metashape Загрузка
            <input 
              type="file" 
              webkitdirectory="true" 
              directory="true" 
              multiple 
              style={{ display: 'none' }}
              onChange={(e) => onUploadFolderForMetashape(e.target.files)}
            />
          </label>
          <label className="upload-btn secondary">
            <ImageIcon size={16} />
            Загрузить 1 фото для ИИ
            <input 
              type="file" 
              accept="image/*"
              style={{ display: 'none' }}
              onChange={(e) => onUploadSingleForAI(e.target.files[0])}
            />
          </label>
        </div>
      </div>

      <div className="project-content">
        <header className="content-header">
          <div>
            <h1 className="content-title">{activeProject.name}</h1>
            <p className="content-subtitle">Результаты обследования от {activeProject.date}</p>
          </div>
          
          <div className="tabs">
            <button 
              className={`tab-btn ${activeTab === '3d' ? 'active' : ''}`}
              onClick={() => setActiveTab('3d')}
            >
              <Box size={18} /> 3D Модель
            </button>
            <button 
              className={`tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
              onClick={() => setActiveTab('gallery')}
            >
              <ImageIcon size={18} /> Галерея
            </button>
          </div>
        </header>

        <div className="content-body">
          {activeTab === '3d' && (
            <div className="view-3d-panel">
              {!imageUrl ? (
                <div className="placeholder-3d">
                  <BoxSelect size={48} className="placeholder-icon" />
                  <p>Загрузите результаты Metashape для отображения 3D модели</p>
                </div>
              ) : (
                <div className="render-container">
                  {/* Здесь будет реальный 3D вьювер, пока что используем ImageViewer или заглушку */}
                  <div className="mock-3d-view">
                    <ImageViewer imageSrc={imageUrl} />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'gallery' && (
            <div className="gallery-panel">
              {imageUrl && (
                <div className="gallery-toolbar">
                  <span className="toolbar-label">Слой ИИ дефектов:</span>
                  <label className="toggle-switch">
                    <input 
                      type="checkbox" 
                      checked={showDefects} 
                      onChange={handleToggleDefects} 
                    />
                    <span className="toggle-slider"></span>
                  </label>
                  <span className="toolbar-status">{showDefects ? 'Включен' : 'Выключен'}</span>
                </div>
              )}

              <div className="gallery-grid">
                {galleryItems.length > 0 ? (
                  galleryItems.map((img, i) => (
                    <div key={i} className="gallery-thumbnail">
                      <img src={img} alt={`Снимок ${i+1}`} />
                      {showDefects && <div className="defect-overlay"></div>}
                    </div>
                  ))
                ) : (
                  <div className="gallery-empty">
                    Нет изображений. Загрузите фото для анализа.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
