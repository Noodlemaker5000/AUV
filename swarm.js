// Swarm animation: small AUVs flocking (boids) over a seabed pipeline,
// sharing data over short-range acoustic links.
(() => {
  const canvas = document.getElementById('swarm');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let N = 16;
  const LINK = 130;          // comms range (px)
  const SEP = 54;            // preferred spacing
  let W = 0, H = 0, dpr = 1, t = 0, running = false, raf = 0;
  let agents = [], snow = [], pings = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  function seabedY(x) {
    return H - 46 + Math.sin(x * 0.006) * 10 + Math.sin(x * 0.017 + 1.3) * 5;
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = W < 600 ? 0.7 : 1;
    if (!agents.length) {
      N = W < 600 ? 9 : 16;
      for (let i = 0; i < N; i++) {
        agents.push({ x: rand(W * .25, W * .6), y: rand(H * .25, H * .6), vx: rand(.6, 1.2), vy: rand(-.3, .3), s: scale * rand(.85, 1.1) });
      }
      for (let i = 0; i < 70; i++) snow.push({ x: rand(0, W), y: rand(0, H), r: rand(.4, 1.6), v: rand(.05, .25), a: rand(.15, .5) });
    } else {
      agents.forEach(a => { a.s = scale * rand(.85, 1.1); a.x = Math.min(a.x, W); a.y = Math.min(a.y, H - 80); });
    }
  }

  // Moving survey target that sweeps along the pipeline
  function target() {
    return { x: (W * 0.5) + Math.sin(t * 0.0045) * W * 0.32, y: H * 0.45 + Math.sin(t * 0.009) * H * 0.12 };
  }

  function step() {
    t++;
    const g = target();
    for (const a of agents) {
      let cx = 0, cy = 0, ax = 0, ay = 0, sx = 0, sy = 0, n = 0;
      for (const b of agents) {
        if (a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < LINK) {
          cx += b.x; cy += b.y; ax += b.vx; ay += b.vy; n++;
          if (d < SEP && d > 0) { sx -= dx / d * (SEP - d); sy -= dy / d * (SEP - d); }
        }
      }
      if (n) {
        a.vx += ((cx / n - a.x) * 0.0006) + ((ax / n - a.vx) * 0.04);
        a.vy += ((cy / n - a.y) * 0.0006) + ((ay / n - a.vy) * 0.04);
      }
      a.vx += sx * 0.004 + (g.x - a.x) * 0.00025;
      a.vy += sy * 0.004 + (g.y - a.y) * 0.00025;
      // keep off the seabed and below the surface
      const floor = seabedY(a.x) - 40;
      if (a.y > floor) a.vy -= (a.y - floor) * 0.01;
      if (a.y < 40) a.vy += (40 - a.y) * 0.01;
      const sp = Math.hypot(a.vx, a.vy), max = 1.5, min = 0.45;
      if (sp > max) { a.vx *= max / sp; a.vy *= max / sp; }
      if (sp < min) { a.vx *= min / sp; a.vy *= min / sp; }
      a.x += a.vx; a.y += a.vy;
    }
    for (const p of snow) { p.y += p.v; p.x += Math.sin((t + p.y) * 0.01) * 0.1; if (p.y > H) { p.y = -2; p.x = rand(0, W); } }
    if (t % 90 === 0) {
      const a = agents[(t / 90) % N | 0];
      pings.push({ x: a.x, y: a.y, r: 0 });
    }
    pings.forEach(p => p.r += 1.4);
    pings = pings.filter(p => p.r < LINK);
  }

  function drawAUV(a) {
    const ang = Math.atan2(a.vy, a.vx), L = 30 * a.s, R = 4.6 * a.s;
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(ang);
    // body
    ctx.fillStyle = '#d9c8a4';
    ctx.beginPath();
    ctx.moveTo(L / 2 + R * 1.4, 0);
    ctx.quadraticCurveTo(L / 2, -R, L / 2 - R, -R);
    ctx.lineTo(-L / 2, -R); ctx.lineTo(-L / 2 - R * .6, -R * .5);
    ctx.lineTo(-L / 2 - R * .6, R * .5); ctx.lineTo(-L / 2, R);
    ctx.lineTo(L / 2 - R, R); ctx.quadraticCurveTo(L / 2, R, L / 2 + R * 1.4, 0);
    ctx.fill();
    // dark mid-section
    ctx.fillStyle = '#1b2733'; ctx.fillRect(-L * .18, -R, L * .3, R * 2);
    // fins + propulsor
    ctx.fillStyle = '#2a3a4a';
    ctx.fillRect(-L / 2 + 1, -R - 3 * a.s, 3 * a.s, 3 * a.s);
    ctx.fillRect(-L / 2 + 1, R, 3 * a.s, 3 * a.s);
    ctx.fillRect(-L / 2 - R * 1.1, -R * .7, R * .5, R * 1.4);
    // nav light
    ctx.fillStyle = '#4cc9f0'; ctx.beginPath(); ctx.arc(L / 2 - R * .2, 0, 1.3 * a.s, 0, 7); ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    // light shafts
    for (let i = 0; i < 4; i++) {
      const x = (W / 4) * i + Math.sin(t * 0.002 + i) * 40;
      const grd = ctx.createLinearGradient(0, 0, 0, H * .8);
      grd.addColorStop(0, 'rgba(120,200,255,.08)'); grd.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 70, 0); ctx.lineTo(x + 160, H * .8); ctx.lineTo(x + 40, H * .8); ctx.fill();
    }
    // marine snow
    for (const p of snow) { ctx.fillStyle = `rgba(200,230,255,${p.a})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
    // seabed
    ctx.fillStyle = '#04121f';
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, seabedY(x));
    ctx.lineTo(W, H); ctx.fill();
    // pipeline
    ctx.strokeStyle = '#3a5068'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = seabedY(x) - 4; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(140,180,210,.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) { const y = seabedY(x) - 6; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    // survey scan from each vehicle to the pipeline
    for (const a of agents) {
      const y0 = seabedY(a.x) - 6;
      const grd = ctx.createLinearGradient(0, a.y, 0, y0);
      grd.addColorStop(0, 'rgba(76,201,240,.10)'); grd.addColorStop(1, 'rgba(76,201,240,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - 10, y0); ctx.lineTo(a.x + 10, y0); ctx.fill();
    }
    // comms links
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const a = agents[i], b = agents[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < LINK) {
        ctx.strokeStyle = `rgba(76,201,240,${(1 - d / LINK) * .55})`; ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]); ctx.lineDashOffset = -t * 0.4;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    // acoustic pings
    for (const p of pings) {
      ctx.strokeStyle = `rgba(76,201,240,${(1 - p.r / LINK) * .6})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.stroke();
    }
    agents.forEach(drawAUV);
  }

  function loop() { step(); draw(); if (running) raf = requestAnimationFrame(loop); }

  resize();
  if (reduced) { for (let i = 0; i < 400; i++) step(); draw(); }
  else {
    for (let i = 0; i < 120; i++) step();
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !running) { running = true; loop(); }
      else if (!e.isIntersecting) { running = false; cancelAnimationFrame(raf); }
    }).observe(canvas);
    draw();
  }
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { resize(); draw(); }, 150); });
})();
