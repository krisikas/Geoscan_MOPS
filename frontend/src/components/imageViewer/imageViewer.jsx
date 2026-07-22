import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, ZoomIn, ZoomOut, RefreshCcw, X } from 'lucide-react';
import './imageViewer.css';
import AdvancedModelViewer from './AdvancedModelViewer';

const ImageViewer = ({ 
  globalImages,
  images, 
  currentIndex, 
  onNavigate, 
  onClose, 
  folderKey, 
  projectId, 
  objectUrls, 
  startSingleProcess,
  aiModels = ['yolo']
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const [showYolo, setShowYolo] = useState(false);
  const [showCrackSam, setShowCrackSam] = useState(false);
  const [isProcessingLocal, setIsProcessingLocal] = useState(false);
  
  const [modelRotation, setModelRotation] = useState(-90); // Metashape Z-up fix
  
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

  const currentImg = images[currentIndex];
  const is3DModel = currentImg ? (currentImg.toLowerCase().endsWith('.glb') || currentImg.toLowerCase().endsWith('.gltf')) : false;
  const maskImgName = currentImg ? currentImg.replace(/\.[^/.]+$/, ".png") : "";
  
  const yoloFolder = folderKey === 'ai_input' ? 'ai_output_yolo' : 'metashape_ai_output_yolo';
  const crackFolder = folderKey === 'ai_input' ? 'ai_output_cracksam' : 'metashape_ai_output_cracksam';

  const hasYolo = currentImg ? globalImages[yoloFolder]?.includes(maskImgName) : false;
  const hasCrack = currentImg ? globalImages[crackFolder]?.includes(maskImgName) : false;

  useEffect(() => {
    resetView();
    setIsProcessingLocal(false);
  }, [currentIndex]);

  useEffect(() => {
      if (!currentImg || is3DModel || isProcessingLocal) return;
      
      const modelsToRun = [];
      if (showYolo && !hasYolo) modelsToRun.push('yolo');
      if (showCrackSam && !hasCrack) modelsToRun.push('cracksam');
      
      if (modelsToRun.length > 0) {
          setIsProcessingLocal(true);
          startSingleProcess(currentImg, modelsToRun).finally(() => setIsProcessingLocal(false));
      }
  }, [currentIndex, showYolo, showCrackSam, hasYolo, hasCrack, is3DModel, currentImg, isProcessingLocal]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') onNavigate(-1);
      if (e.key === 'ArrowRight') onNavigate(1);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNavigate, onClose]);

  if (!currentImg) return null;

  const targetKeySource = `${projectId}_${folderKey}_${currentImg}`;
  const targetKeyYolo = `${projectId}_${yoloFolder}_${maskImgName}`;
  const targetKeyCrack = `${projectId}_${crackFolder}_${maskImgName}`;
  
  const imageSrcSource = objectUrls[targetKeySource];
  const imageSrcYolo = objectUrls[targetKeyYolo];
  const imageSrcCrack = objectUrls[targetKeyCrack];

  const handleSourceClick = () => {
      setShowYolo(false);
      setShowCrackSam(false);
  };

  const handleToggleYolo = async () => {
      const nextState = !showYolo;
      setShowYolo(nextState);
      if (nextState && !hasYolo) {
          setIsProcessingLocal(true);
          try { await startSingleProcess(currentImg, ['yolo']); } catch(e){}
          setIsProcessingLocal(false);
      }
  };

  const handleToggleCrackSam = async () => {
      const nextState = !showCrackSam;
      setShowCrackSam(nextState);
      if (nextState && !hasCrack) {
          setIsProcessingLocal(true);
          try { await startSingleProcess(currentImg, ['cracksam']); } catch(e){}
          setIsProcessingLocal(false);
      }
  };

  const isSourceOnly = !showYolo && !showCrackSam;

  return (
    <div 
      className="image-viewer"
      onWheel={is3DModel ? undefined : handleWheel}
      onMouseMove={is3DModel ? undefined : handleMouseMove}
      onMouseUp={is3DModel ? undefined : handleMouseUp}
      onMouseLeave={is3DModel ? undefined : handleMouseUp}
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

      <div className="image-viewer__container" ref={containerRef} onClick={e => e.stopPropagation()} style={is3DModel ? { padding: 0 } : {}}>
        {imageSrcSource ? (
            is3DModel ? (
                <AdvancedModelViewer 
                    src={imageSrcSource} 
                    rotationFix={modelRotation === -90 || modelRotation === 270}
                />
            ) : (
                (isProcessingLocal || (showYolo && !hasYolo) || (showCrackSam && !hasCrack)) ? (
                    <div className="image-viewer__loader">
                        <div className="premium-loader premium-loader--large"></div>
                    </div>
                ) : (
                    <div 
                      className="image-viewer__layers"
                      ref={imageRef}
                      onMouseDown={handleMouseDown}
                      style={{
                        position: 'relative',
                        transform: `scale(${scale}) translate(${position.x}px, ${position.y}px)`,
                        cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                      }}
                    >
                        <img
                          src={imageSrcSource}
                          alt="Исходник"
                          className="image-viewer__layer-source"
                          draggable={false}
                        />
                        {showYolo && imageSrcYolo && (
                            <img
                              src={imageSrcYolo}
                              alt="YOLO"
                              className="image-viewer__layer-yolo"
                              draggable={false}
                            />
                        )}
                        {showCrackSam && imageSrcCrack && (
                            <img
                              src={imageSrcCrack}
                              alt="CrackSAM"
                              className="image-viewer__layer-cracksam"
                              draggable={false}
                            />
                        )}
                    </div>
                )
            )
        ) : (
            <div className="image-viewer__loader">
                <div className="premium-loader premium-loader--large"></div>
            </div>
        )}
        
        <div className="image-viewer__controls-wrapper">
          {!is3DModel && (
             <div className={`image-viewer__legend ${showYolo || showCrackSam ? 'visible' : 'hidden'}`}>
                 <div className="legend-item" style={{display: (showYolo || showCrackSam) ? 'flex' : 'none'}}>
                     <span className="legend-color" style={{backgroundColor: '#ff0000'}}></span>Трещины
                 </div>
                 <div className="legend-item" style={{display: showYolo ? 'flex' : 'none'}}>
                     <span className="legend-color" style={{backgroundColor: '#ffff00'}}></span>Сколы
                 </div>
                 <div className="legend-item" style={{display: showYolo ? 'flex' : 'none'}}>
                     <span className="legend-color" style={{backgroundColor: '#00ff00'}}></span>Растительность
                 </div>
                 <div className="legend-item" style={{display: showYolo ? 'flex' : 'none'}}>
                     <span className="legend-color" style={{backgroundColor: '#0000ff'}}></span>Отслоения
                 </div>
             </div>
          )}
          
          <div className="image-viewer__controls">
            {!is3DModel && (
              <div className="segmented-control image-viewer__segmented-control">
                 <button className={`segmented-btn ${isSourceOnly ? 'active' : ''}`} onClick={handleSourceClick}>Исходник</button>
                 <button className={`segmented-btn ${showYolo ? 'active' : ''}`} onClick={handleToggleYolo}>YOLO</button>
                 <button className={`segmented-btn ${showCrackSam ? 'active' : ''}`} onClick={handleToggleCrackSam}>CrackSAM</button>
              </div>
            )}
          
          {!is3DModel && (
              <>
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
              </>
          )}

          {is3DModel && (
              <>
                  <button className="image-viewer__btn image-viewer__btn--rotate" onClick={() => setModelRotation(prev => (prev + 90) % 360)} title="Повернуть ось (исправить кривое вращение)">
                    <RefreshCw size={18} /> <span>Повернуть ось</span>
                  </button>
                  <div className="image-viewer__divider"></div>
              </>
          )}
          
          <button className="image-viewer__btn image-viewer__btn--close" onClick={onClose} title="Закрыть">
            <X size={18} />
          </button>
          </div>
        </div>
        
        <div className="image-viewer__counter">
            {currentIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;