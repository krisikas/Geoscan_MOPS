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
      // ВОЗВРАЩАЕМ ИСХОДНЫЕ НАСТРОЙКИ (Густота, радиус, скорость)
      particleCount: Math.min(250, Math.floor((w * h) / 10000)),
      linkRadius: 180,
      moveSpeed: 0.3,
    };

    let mouse = { x: null, y: null, radius: 250 };
    
    const handleMouseMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

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
        
        if (mouse.x != null && mouse.y != null) {
          let dx = mouse.x - this.x;
          let dy = mouse.y - this.y;
          // Оптимизация 1: Квадрат расстояния вместо корня
          let distSq = dx * dx + dy * dy;
          let radiusSq = mouse.radius * mouse.radius;
          
          if (distSq < radiusSq) {
            let dist = Math.sqrt(distSq);
            let force = (mouse.radius - dist) / mouse.radius;
            let forceX = (dx / dist) * force * 0.8;
            let forceY = (dy / dist) * force * 0.8;
            this.x += forceX;
            this.y += forceY;
          }
        }

        this.x += this.vx;
        this.y += this.vy;
      }
    }

    for (let i = 0; i < properties.particleCount; i++) {
      particles.push(new Particle());
    }

    const radiusSq = properties.linkRadius * properties.linkRadius;
    
    // Оптимизация 2: Ограничение FPS для фона.
    // Фону не нужно обновляться 144 раза в секунду, 30 FPS достаточно для плавной анимации,
    // и это сразу срезает нагрузку на процессор в 2-4 раза на игровых мониторах.
    let lastTime = 0;
    const fpsInterval = 1000 / 30; // 30 кадров в секунду

    const draw = (currentTime) => {
      animationFrameId = requestAnimationFrame(draw);
      
      const elapsed = currentTime - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = currentTime - (elapsed % fpsInterval);

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
      }

      particles.sort((a, b) => a.x - b.x);

      // Оптимизация 3: Использование rgb(224, 38, 0) и globalAlpha 
      // Вместо создания новой строки rgba(224, 38, 0, alpha) тысячи раз в секунду
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          let dx = particles[j].x - particles[i].x;
          
          if (dx > properties.linkRadius) break;

          let dy = particles[j].y - particles[i].y;
          // Оптимизация 4: Быстрые проверки по квадратам
          if (dy * dy > radiusSq) continue;

          let distSq = dx * dx + dy * dy;
          if (distSq > radiusSq) continue;

          let dist = Math.sqrt(distSq);

          // Линии (Возвращаем 1 в 1 как было)
          const lineAlpha = 0.15 - (dist / properties.linkRadius) * 0.15;
          ctx.beginPath();
          ctx.globalAlpha = lineAlpha;
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();

          // Треугольники (Возвращаем 1 в 1 как было, с наложением друг на друга)
          for (let k = j + 1; k < particles.length; k++) {
            let dx3 = particles[k].x - particles[i].x;
            if (dx3 > properties.linkRadius) break;

            let dy3 = particles[k].y - particles[i].y;
            if (dy3 * dy3 > radiusSq) continue;

            let dx2 = particles[k].x - particles[j].x;
            if (dx2 * dx2 > radiusSq) continue;
            let dy2 = particles[k].y - particles[j].y;
            if (dy2 * dy2 > radiusSq) continue;

            let dist2Sq = dx2 * dx2 + dy2 * dy2;
            if (dist2Sq > radiusSq) continue;

            let dist3Sq = dx3 * dx3 + dy3 * dy3;
            if (dist3Sq > radiusSq) continue;

            let dist2 = Math.sqrt(dist2Sq);
            let dist3 = Math.sqrt(dist3Sq);

            let faceAlpha = 0.04 - (dist + dist2 + dist3) / (properties.linkRadius * 3) * 0.04;
            if (faceAlpha > 0) {
              ctx.beginPath();
              ctx.globalAlpha = faceAlpha * 1.5;
              ctx.fillStyle = "#e02600"; // Точный цвет --color-accent
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.lineTo(particles[k].x, particles[k].y);
              ctx.closePath();
              ctx.fill();
            }
          }
        }
      }
      
      // Сбрасываем прозрачность
      ctx.globalAlpha = 1.0;
    };

    requestAnimationFrame(draw);

    const handleResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
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
