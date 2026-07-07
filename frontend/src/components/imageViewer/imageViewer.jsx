import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Layers } from 'lucide-react';
import './imageViewer.css';

const ImageViewer = ({ 
  globalImages,
  images, 
  currentIndex, 
  onNavigate, 
  onClose, 
  folderKey, 
  projectId, 
  objectUrls, 
  startSingleProcess 
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [showDefects, setShowDefects] = useState(false);
  const [API_BASE_URL] = useState(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000');
  
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const newScale = e.deltaY > 0 
      ? Math.max(0.1, scale - zoomSpeed)
      : Math.min(5, scale + zoomSpeed);
    
    setScale(newScale);
  }, [scale]);

  const handleMouseDown = useCallback((e) => {
    if (scale <= 1) return;
    
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  }, [scale, position]);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging || scale <= 1) return;

    e.preventDefault(); 

    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;

    const containerRect = containerRef.current.getBoundingClientRect();
    const imageRect = imageRef.current.getBoundingClientRect();
    
    const maxX = Math.max(0, (imageRect.width * scale - containerRect.width) / 2);
    const maxY = Math.max(0, (imageRect.height * scale - containerRect.height) / 2);

    setPosition({
      x: Math.max(-maxX, Math.min(maxX, newX)),
      y: Math.max(-maxY, Math.min(maxY, newY))
    });
  }, [isDragging, dragStart, scale]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const zoomIn = () => {
    setScale(prev => Math.min(5, prev + 0.2));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(0.1, prev - 0.2));
  };

  const resetView = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  useEffect(() => {
    resetView();
  }, [currentIndex, showDefects]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') onNavigate(-1);
      if (e.key === 'ArrowRight') onNavigate(1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate, onClose]);

  const currentImg = images[currentIndex];
  const targetFolder = folderKey === 'ai_input' ? 'ai_output' : 'metashape_ai_output';
  const hasDefects = folderKey === 'ai_input' ? globalImages.ai_output.includes(currentImg) : globalImages.metashape_ai_output.includes(currentImg);
  
  const targetKey = `${projectId}_${showDefects ? targetFolder : folderKey}_${currentImg}`;
  const imageSrc = objectUrls[targetKey];

  const loadOrProcess = async (forceProcess = false) => {
     if (!forceProcess && hasDefects) return; 
     onClose();
     try {
         await startSingleProcess(currentImg);
     } catch (e) {}
  };
  
  useEffect(() => {
     if (showDefects) loadOrProcess();
  }, [showDefects, currentIndex]);

  if (!images || images.length === 0) return null;

  return (
    <div 
      className="image-viewer"
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="image-viewer__topbar" onClick={e => e.stopPropagation()}>
         <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span style={{ color: '#fff', fontSize: '14px' }}>{currentImg} ({currentIndex + 1} / {images.length})</span>
         </div>
         <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <label className="toggle-switch" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#fff', fontSize: '14px' }}>
                <input type="checkbox" checked={showDefects} onChange={(e) => setShowDefects(e.target.checked)} style={{ display: 'none' }} />
                <div style={{ width: '36px', height: '20px', background: showDefects ? '#E02600' : '#3f3f46', borderRadius: '10px', position: 'relative', transition: '0.3s' }}>
                    <div style={{ width: '16px', height: '16px', background: '#fff', borderRadius: '50%', position: 'absolute', top: '2px', left: showDefects ? '18px' : '2px', transition: '0.3s' }}></div>
                </div>
                <span>С дефектами</span>
            </label>
            {showDefects && (
                <button onClick={() => loadOrProcess(true)} className="image-viewer__btn process-btn" title="Обработать заново">
                    <RefreshCw size={16} />
                    <span>Переделать</span>
                </button>
            )}
         </div>
      </div>

      {currentIndex > 0 && (
          <button className="nav-arrow nav-arrow--left" onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}><ChevronLeft size={32}/></button>
      )}
      {currentIndex < images.length - 1 && (
          <button className="nav-arrow nav-arrow--right" onClick={(e) => { e.stopPropagation(); onNavigate(1); }}><ChevronRight size={32}/></button>
      )}

      <div className="image-viewer__container" ref={containerRef} onClick={e => e.stopPropagation()}>
        {imageSrc ? (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Просмотр"
              className="image-viewer__img"
              style={{
                transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
              onMouseDown={handleMouseDown}
            />
        ) : (
            <div className="image-viewer__loader"><p style={{ color: '#fff' }}>Загрузка...</p></div>
        )}
        
        <div className="image-viewer__zoom-info">
          {Math.round(scale * 100)}%
        </div>

        <div className="image-viewer__controls" onClick={e => e.stopPropagation()}>
          <button className="image-viewer__btn" onClick={zoomOut} title="Уменьшить">−</button>
          <button className="image-viewer__btn" onClick={resetView} title="Сбросить">↺</button>
          <button className="image-viewer__btn" onClick={zoomIn} title="Увеличить">+</button>
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;