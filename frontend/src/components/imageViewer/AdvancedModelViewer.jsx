import React, { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGLTF, TrackballControls, Bounds, Center, Environment, GizmoHelper, GizmoViewport } from '@react-three/drei';

function Model({ url, rotationFix }) {
  const { scene } = useGLTF(url);
  
  // Clone the scene so we don't mutate the cached one, though in this case it might be okay.
  return (
    <primitive 
      object={scene} 
      rotation={rotationFix ? [-Math.PI / 2, 0, 0] : [0, 0, 0]} 
    />
  );
}

const AdvancedModelViewer = ({ src, rotationFix = true }) => {
  return (
    <div style={{ width: '100%', height: '100%', background: '#09090b', position: 'relative' }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <color attach="background" args={['#09090b']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        <directionalLight position={[-10, -10, -5]} intensity={0.5} />
        
        {/* Temporary axes for debugging */}
        <axesHelper args={[5]} />
        
        <Suspense fallback={null}>
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
      <div style={{ position: 'absolute', bottom: '15px', left: '15px', color: 'rgba(255,255,255,0.5)', fontSize: '12px', pointerEvents: 'none' }}>
        ЛКМ - вращение | ПКМ - панорамирование | Колесико - зум
      </div>
    </div>
  );
};

export default AdvancedModelViewer;
