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
      particleCount: Math.min(250, Math.floor((w * h) / 10000)), // Original high density, capped at 250 for massive 4k screens
      linkRadius: 180, // Restored original radius for large polygons
      moveSpeed: 0.3, // Restored original graceful speed
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
        this.baseVx = this.vx;
        this.baseVy = this.vy;
      }
      update() {
        if (this.x < 0 || this.x > w) this.vx *= -1;
        if (this.y < 0 || this.y > h) this.vy *= -1;
        
        // Взаимодействие с курсором
        if (mouse.x != null && mouse.y != null) {
          let dx = mouse.x - this.x;
          let dy = mouse.y - this.y;
          let dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist < mouse.radius) {
            let force = (mouse.radius - dist) / mouse.radius;
            // Очень мягкое притяжение
            let forceX = (dx / dist) * force * 0.8;
            let forceY = (dy / dist) * force * 0.8;
            this.x += forceX; // Притяжение (заставляет полигоны собираться вокруг курсора)
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

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Сначала обновляем все координаты
      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
      }

      // ОПТИМИЗАЦИЯ 1: Сортировка по оси X.
      // Занимает доли миллисекунды (т.к. массив почти отсортирован с прошлого кадра),
      // но позволяет мгновенно отсекать дальние частицы (O(N log N) вместо O(N^2))
      particles.sort((a, b) => a.x - b.x);

      for (let i = 0; i < particles.length; i++) {
        // Отрисовка связей и треугольников
        for (let j = i + 1; j < particles.length; j++) {
          let dx = particles[j].x - particles[i].x; // Всегда >= 0 благодаря сортировке
          
          // ОПТИМИЗАЦИЯ 2: Если по X расстояние больше радиуса, прерываем внутренний цикл.
          // Все оставшиеся элементы j будут еще дальше!
          if (dx > properties.linkRadius) break;

          let dy = particles[j].y - particles[i].y;
          if (Math.abs(dy) > properties.linkRadius) continue;

          let dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < properties.linkRadius) {
            // Линии
            const lineAlpha = 0.15 - (dist / properties.linkRadius) * 0.15;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${lineAlpha})`;
            ctx.lineWidth = 1;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();

            // Треугольники
            for (let k = j + 1; k < particles.length; k++) {
              let dx3 = particles[k].x - particles[i].x;
              // ОПТИМИЗАЦИЯ 3: Тот же трюк для третьего угла треугольника
              if (dx3 > properties.linkRadius) break;

              let dy3 = particles[k].y - particles[i].y;
              if (Math.abs(dy3) > properties.linkRadius) continue;

              let dx2 = particles[k].x - particles[j].x;
              let dy2 = particles[k].y - particles[j].y;
              if (Math.abs(dx2) > properties.linkRadius || Math.abs(dy2) > properties.linkRadius) continue;

              let dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
              if (dist2 < properties.linkRadius) {
                let dist3 = Math.sqrt(dx3 * dx3 + dy3 * dy3);

                if (dist3 < properties.linkRadius) {
                  let faceAlpha = 0.04 - (dist + dist2 + dist3) / (properties.linkRadius * 3) * 0.04;
                  if (faceAlpha > 0) {
                    ctx.beginPath();
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
