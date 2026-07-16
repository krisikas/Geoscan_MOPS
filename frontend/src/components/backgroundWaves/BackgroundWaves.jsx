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
      constructor(id) {
        this.id = id;
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
      particles.push(new Particle(i));
    }

    const radiusSq = properties.linkRadius * properties.linkRadius;
    const cellSize = properties.linkRadius;

    let lastTime = 0;
    const fpsInterval = 1000 / 30; // 30 FPS

    const draw = (currentTime) => {
      animationFrameId = requestAnimationFrame(draw);
      
      const elapsed = currentTime - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = currentTime - (elapsed % fpsInterval);

      ctx.clearRect(0, 0, w, h);

      // Пространственная сетка (Spatial Hashing)
      // Разбиваем экран на ячейки размером с linkRadius.
      // Это позволяет не проверять каждую частицу с каждой (что давало 2.6 млн итераций),
      // а проверять только соседние ячейки (снижает количество итераций до ~25 тысяч!)
      const cols = Math.ceil(w / cellSize);
      const rows = Math.ceil(h / cellSize);
      const grid = new Array(cols * rows);
      for (let i = 0; i < grid.length; i++) grid[i] = [];

      for (let i = 0; i < particles.length; i++) {
        particles[i].update();
        let col = Math.floor(particles[i].x / cellSize);
        let row = Math.floor(particles[i].y / cellSize);
        if (col < 0) col = 0; if (col >= cols) col = cols - 1;
        if (row < 0) row = 0; if (row >= rows) row = rows - 1;
        grid[row * cols + col].push(particles[i]);
      }

      // Отрисовка
      for (let i = 0; i < particles.length; i++) {
        let pI = particles[i];
        
        let colI = Math.floor(pI.x / cellSize);
        let rowI = Math.floor(pI.y / cellSize);
        if (colI < 0) colI = 0; if (colI >= cols) colI = cols - 1;
        if (rowI < 0) rowI = 0; if (rowI >= rows) rowI = rows - 1;

        // Собираем соседей только из текущей и 8 смежных ячеек
        let neighbors = [];
        for (let r = Math.max(0, rowI - 1); r <= Math.min(rows - 1, rowI + 1); r++) {
          for (let c = Math.max(0, colI - 1); c <= Math.min(cols - 1, colI + 1); c++) {
            let cell = grid[r * cols + c];
            for (let n = 0; n < cell.length; n++) {
              let pN = cell[n];
              // Проверяем только частицы с бОльшим ID, чтобы избежать двойной отрисовки
              if (pN.id > pI.id) {
                let dx = pN.x - pI.x;
                let dy = pN.y - pI.y;
                if (dx * dx + dy * dy < radiusSq) {
                  neighbors.push(pN);
                }
              }
            }
          }
        }

        // Отрисовка связей с найденными соседями
        for (let j = 0; j < neighbors.length; j++) {
          let pJ = neighbors[j];
          let dist = Math.sqrt(Math.pow(pJ.x - pI.x, 2) + Math.pow(pJ.y - pI.y, 2));

          // Линии
          const lineAlpha = 0.15 - (dist / properties.linkRadius) * 0.15;
          if (lineAlpha > 0) {
            ctx.beginPath();
            ctx.globalAlpha = lineAlpha;
            ctx.strokeStyle = "#ffffff";
            ctx.lineWidth = 1;
            ctx.moveTo(pI.x, pI.y);
            ctx.lineTo(pJ.x, pJ.y);
            ctx.stroke();
          }

          // Треугольники
          // Ищем третью точку только среди уже найденных соседей
          for (let k = 0; k < neighbors.length; k++) {
            let pK = neighbors[k];
            // Избегаем дубликатов (pJ.id < pK.id)
            if (pK.id <= pJ.id) continue;
            
            let dx2 = pK.x - pJ.x;
            let dy2 = pK.y - pJ.y;
            let dist2Sq = dx2 * dx2 + dy2 * dy2;
            
            // Если pJ и pK близко друг к другу
            if (dist2Sq < radiusSq) {
              let dist2 = Math.sqrt(dist2Sq);
              let dist3 = Math.sqrt(Math.pow(pK.x - pI.x, 2) + Math.pow(pK.y - pI.y, 2));
              
              let faceAlpha = 0.04 - (dist + dist2 + dist3) / (properties.linkRadius * 3) * 0.04;
              if (faceAlpha > 0) {
                ctx.beginPath();
                ctx.globalAlpha = faceAlpha * 1.5;
                ctx.fillStyle = "#e02600";
                ctx.moveTo(pI.x, pI.y);
                ctx.lineTo(pJ.x, pJ.y);
                ctx.lineTo(pK.x, pK.y);
                ctx.closePath();
                ctx.fill();
              }
            }
          }
        }
      }
      
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
