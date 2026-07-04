import React, { useState } from 'react';
import './ResultPage.css';
import ImageViewer from '../../components/imageViewer/imageViewer';

export default function ResultPage({ 
  imageUrl, 
  onUploadFolderForMetashape, 
  onUploadSingleForAI, 
  loadingMessage 
}) {
  const [showDefects, setShowDefects] = useState(true);

  // Для демонстрации галереи будем использовать imageUrl, если он есть
  // Иначе покажем пару пустых слотов
  const galleryItems = imageUrl ? [imageUrl, imageUrl, imageUrl] : [];

  const handleToggleDefects = () => {
    setShowDefects(!showDefects);
  };

  return (
    <div className="result-page">
      <div className="result-top">
        <div className="panel view-3d-panel">
          <h2 className="panel-title">3D viewer</h2>
          {!imageUrl && (
            <div className="upload-actions">
              <p>Загрузите фото для построения модели и поиска дефектов</p>
              <label className="btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                Загрузить папку (Metashape)
                <input 
                  type="file" 
                  webkitdirectory="true" 
                  directory="true" 
                  multiple 
                  style={{ display: 'none' }}
                  onChange={(e) => onUploadFolderForMetashape(e.target.files)}
                />
              </label>
              <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-block', marginTop: '10px' }}>
                Загрузить 1 фото (ИИ)
                <input 
                  type="file" 
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => onUploadSingleForAI(e.target.files[0])}
                />
              </label>
            </div>
          )}
        </div>
        
        <div className="panel photo-panel">
          {imageUrl && (
            <div className="photo-toolbar">
              <span className="toolbar-label">Отображение:</span>
              <label className="toggle-switch">
                <input 
                  type="checkbox" 
                  checked={showDefects} 
                  onChange={handleToggleDefects} 
                />
                <span className="toggle-slider"></span>
              </label>
              <span className="toolbar-status">{showDefects ? 'С дефектами' : 'Чистое фото'}</span>
            </div>
          )}
          <div className="photo-viewer-wrapper">
            <ImageViewer imageSrc={imageUrl} />
          </div>
        </div>
      </div>
      
      <div className="panel gallery-panel">
        {galleryItems.length > 0 ? (
          <div className="gallery-track">
            {galleryItems.map((img, i) => (
              <div key={i} className="gallery-item">
                <img src={img} alt={`Снимок ${i+1}`} />
              </div>
            ))}
          </div>
        ) : (
          <div className="gallery-empty">
            Галерея пуста. Обработайте изображения, чтобы увидеть результаты.
          </div>
        )}
      </div>
    </div>
  );
}
