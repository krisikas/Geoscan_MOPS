import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Grid, Text, Billboard, Edges } from '@react-three/drei';
import * as THREE from 'three';

// Component to draw a custom polygonal building
function Building({ basePoints = [], height = 10, color = "#444" }) {
  const geometry = useMemo(() => {
    if (!basePoints || basePoints.length < 3) return null;
    
    // Create a 2D shape using the X and Y coordinates (No need to invert Y here, rotateX handles it)
    const shape = new THREE.Shape();
    shape.moveTo(basePoints[0].x, basePoints[0].y);
    for (let i = 1; i < basePoints.length; i++) {
      shape.lineTo(basePoints[i].x, basePoints[i].y);
    }
    shape.lineTo(basePoints[0].x, basePoints[0].y); // Close the polygon

    const extrudeSettings = {
      depth: height,
      bevelEnabled: false,
    };
    
    // Extrude geometry creates the volume along Z by default.
    // We need to rotate it so it goes UP in the Y axis.
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(-Math.PI / 2);
    
    return geo;
  }, [basePoints, height]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, 0, 0]}>
      <meshStandardMaterial color={color} opacity={0.7} transparent depthWrite={false} />
      <Edges scale={1.0} threshold={15} color="#666" />
    </mesh>
  );
}

export default function RouteVisualizer({ coordinates = [], buildings = [], currentStep = 0 }) {
  // Convert coordinate objects {x,y,z} into an array of THREE.Vector3
  const points = useMemo(() => {
    if (!coordinates || coordinates.length === 0) return [];
    return coordinates.map(c => new THREE.Vector3(c.x, c.z, -c.y)); 
  }, [coordinates]);

  const hasRoute = points.length > 0;
  const visiblePoints = hasRoute ? points.slice(0, currentStep + 1) : [];

  return (
    <div style={{ width: '100%', height: '100%', background: '#050505', borderRadius: '24px', overflow: 'hidden' }}>
      <Canvas camera={{ position: [15, 15, 15], fov: 50 }}>
        <color attach="background" args={['#050505']} />
        
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 20, 10]} intensity={1} />

        <Grid 
          infiniteGrid 
          fadeDistance={60} 
          cellColor="rgba(255, 255, 255, 0.05)" 
          sectionColor="rgba(255, 255, 255, 0.1)"
          sectionSize={5}
          cellSize={1}
        />

        {/* Custom AI-drawn buildings */}
        {buildings.map((b, i) => (
           <Building key={`bldg-${i}`} basePoints={b.base_points} height={b.height} />
        ))}

        {/* Flight Route */}
        {hasRoute && (
          <group>
            {/* Draw the line connecting all visible points */}
            {visiblePoints.length > 1 && (
                <Line 
                  points={visiblePoints} 
                  color="#e02600" 
                  lineWidth={3}
                  dashed={false}
                />
            )}
            
            {/* Draw spheres and labels at each visible waypoint */}
            {visiblePoints.map((p, idx) => (
              <group key={`wp-group-${idx}`} position={p}>
                <mesh>
                  <sphereGeometry args={[0.2, 32, 32]} />
                  <meshStandardMaterial 
                    color={idx === 0 ? "#10b981" : (idx === points.length - 1 ? "#e02600" : "#ffffff")} 
                    emissive={idx === 0 ? "#10b981" : (idx === points.length - 1 ? "#e02600" : "#ffffff")}
                    emissiveIntensity={0.5}
                  />
                </mesh>
                {/* Floating coordinate text */}
                <Billboard position={[0, 0.8, 0]}>
                    <Text 
                      fontSize={0.4} 
                      color="#aaaaaa"
                      anchorX="center"
                      anchorY="middle"
                    >
                      ({coordinates[idx].x.toFixed(1)}, {coordinates[idx].y.toFixed(1)}, {coordinates[idx].z.toFixed(1)})
                    </Text>
                </Billboard>
              </group>
            ))}

            {/* Glowing Drone Indicator for current step */}
            {points[currentStep] && (
                <mesh position={points[currentStep]} rotation={[Math.PI/2, 0, 0]}>
                    <torusGeometry args={[0.6, 0.08, 16, 100]} />
                    <meshStandardMaterial color="#e02600" emissive="#e02600" emissiveIntensity={2} transparent opacity={0.8} />
                </mesh>
            )}
          </group>
        )}

        {/* Disable damping to remove the inertial/accelerated camera rotation */}
        <OrbitControls makeDefault enableDamping={false} />
      </Canvas>
      
      {!hasRoute && (
        <div style={{ 
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          color: '#888', pointerEvents: 'none', flexDirection: 'column', gap: '10px' 
        }}>
          <p>Ожидание генерации маршрута...</p>
        </div>
      )}
    </div>
  );
}
