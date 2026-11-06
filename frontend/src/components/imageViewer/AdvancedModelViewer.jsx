import React, { Suspense, Component, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, TrackballControls, Bounds, Center, Environment, GizmoHelper, GizmoViewport, Html } from '@react-three/drei';

function Model({ url, rotationFix }) {
  const { scene } = useGLTF(url);
  const instance = useMemo(() => scene.clone(true), [scene]);
  
  return (
    <primitive 
      object={instance}
      rotation={rotationFix ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} 
    />
  );
}

class ModelErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div className="model-error" role="alert">Не удалось открыть 3D-модель. Проверьте файл и подключение к сети, затем откройте просмотр повторно.</div>;
    }
    return this.props.children;
  }
}

const AdvancedModelViewer = ({ src, rotationFix = true }) => {
  return (
    <div className="model-viewer-shell">
      <ModelErrorBoundary key={src}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <color attach="background" args={['#09090b']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        <directionalLight position={[-10, -10, -5]} intensity={0.5} />
        
        <Suspense fallback={<Html center><div className="model-loading" role="status">Загрузка модели…</div></Html>}>
          <Environment preset="city" />
          <Bounds fit clip observe margin={1.2}>
            <Center>
              <Model url={src} rotationFix={rotationFix} />
            </Center>
          </Bounds>
        </Suspense>
        
        <GizmoHelper alignment="bottom-right" margin={[40, 40]}>
          <GizmoViewport axisColors={['red', 'green', 'blue']} labelColor="black" />
        </GizmoHelper>
        
        <TrackballControls 
          makeDefault
          staticMoving={true}
          panSpeed={2.5}
          zoomSpeed={3.0}
          rotateSpeed={3.0}
        />
      </Canvas>
      </ModelErrorBoundary>
      <div className="model-viewer-hint">
        ЛКМ - вращение | ПКМ - панорамирование | Колесико - зум
      </div>
    </div>
  );
};

export default AdvancedModelViewer;
