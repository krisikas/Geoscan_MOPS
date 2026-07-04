import React, { useEffect, useRef } from 'react';
import './BackgroundWaves.css';

export default function BackgroundWaves() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;

    const particles = [];
    const properties = {
      particleCount: Math.floor((w * h) / 15000), // Dynamic count based on screen size
      linkRadius: 180,
      moveSpeed: 0.3, // Very slow and graceful
    };

    class Particle {
      constructor() {
        this.x = Math.random() * w;
        this.y = Math.random() * h;
        this.vx = (Math.random() - 0.5) * properties.moveSpeed;
        this.vy = (Math.random() - 0.5) * properties.moveSpeed;
      }
      update() {
        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
        this.x += this.vx;
        this.y += this.vy;
      }
    }

    for (let i = 0; i < properties.particleCount; i++) {
      particles.push(new Particle());
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();

        // Draw connections and triangles
        for (let j = i + 1; j < particles.length; j++) {
          let dx = particles[i].x - particles[j].x;
          let dy = particles[i].y - particles[j].y;
          let dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < properties.linkRadius) {
            // Draw lines (wireframe)
            const lineAlpha = 0.15 - (dist / properties.linkRadius) * 0.15;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${lineAlpha})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();

            // Find third point for triangle (polygonal face)
            for (let k = j + 1; k < particles.length; k++) {
              let dx2 = particles[j].x - particles[k].x;
              let dy2 = particles[j].y - particles[k].y;
              let dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

              let dx3 = particles[i].x - particles[k].x;
              let dy3 = particles[i].y - particles[k].y;
              let dist3 = Math.sqrt(dx3 * dx3 + dy3 * dy3);

              if (dist2 < properties.linkRadius && dist3 < properties.linkRadius) {
                // Determine opacity based on how close the three points are
                let faceAlpha = 0.04 - (dist + dist2 + dist3) / (properties.linkRadius * 3) * 0.04;
                if (faceAlpha > 0) {
                  ctx.beginPath();
                  // Using Geoscan Red for the polygonal fill
                  ctx.fillStyle = `rgba(224, 38, 0, ${faceAlpha * 1.5})`;
                  ctx.moveTo(particles[i].x, particles[i].y);
                  ctx.lineTo(particles[j].x, particles[j].y);
                  ctx.lineTo(particles[k].x, particles[k].y);
                  ctx.closePath();
                  ctx.fill();
                }
              }
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className="bg-waves-container">
      <div className="bg-ambient-gradient"></div>
      <canvas ref={canvasRef} className="bg-dynamic-canvas" />
    </div>
  );
}
