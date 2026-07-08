import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, ZoomIn, ZoomOut, RefreshCcw, X } from 'lucide-react';
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

  const zoomIn = () => setScale(prev => Math.min(5, prev + 0.2));
  const zoomOut = () => setScale(prev => Math.max(0.1, prev - 0.2));
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
  const hasDefects = folderKey === 'ai_input' 
    ? globalImages.ai_output.includes(currentImg) 
    : globalImages.metashape_ai_output.includes(currentImg);
  
  const targetKey = `${projectId}_${showDefects ? targetFolder : folderKey}_${currentImg}`;
  const imageSrc = objectUrls[targetKey];

  const loadOrProcess = async (forceProcess = false) => {
     if (!forceProcess && hasDefects) return; 
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
      {currentIndex > 0 && (
          <button className="nav-arrow nav-arrow--left" onClick={(e) => { e.stopPropagation(); onNavigate(-1); }}>
              <ChevronLeft size={24} />
          </button>
      )}
      {currentIndex < images.length - 1 && (
          <button className="nav-arrow nav-arrow--right" onClick={(e) => { e.stopPropagation(); onNavigate(1); }}>
              <ChevronRight size={24} />
          </button>
      )}

      <div className="image-viewer__container" ref={containerRef} onClick={e => e.stopPropagation()}>
        {imageSrc ? (
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Просмотр"
              className="image-viewer__img"
              draggable={false}
              style={{
                transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
              }}
              onMouseDown={handleMouseDown}
            />
        ) : (
            <div className="image-viewer__loader">
                <div className="premium-loader premium-loader--large"></div>
            </div>
        )}
        
        <div className="image-viewer__controls">
          <div className="segmented-control" style={{ marginRight: '16px', background: '#09090b', borderColor: '#27272a' }}>
             <button className={`segmented-btn ${!showDefects ? 'active' : ''}`} onClick={() => setShowDefects(false)}>Исходник</button>
             <button className={`segmented-btn ${showDefects ? 'active' : ''}`} onClick={() => setShowDefects(true)}>Результат</button>
          </div>
          
          <button className="image-viewer__btn" onClick={zoomOut} title="Уменьшить">
            <ZoomOut size={18} />
          </button>
          <button className="image-viewer__btn" onClick={resetView} title="Сбросить">
            <RefreshCcw size={18} />
          </button>
          <button className="image-viewer__btn" onClick={zoomIn} title="Увеличить">
            <ZoomIn size={18} />
          </button>
          
          <div className="image-viewer__divider"></div>
          
          <button className="image-viewer__btn image-viewer__btn--close" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
        </div>
        
        <div className="image-viewer__counter">
            {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;