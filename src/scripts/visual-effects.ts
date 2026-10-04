import type { Cleanup } from './site';

type Star = { x: number; y: number; size: number; opacity: number; twinkleSpeed: number; twinklePhase: number };
type Meteor = { x: number; y: number; vx: number; vy: number; length: number; opacity: number; life: number; maxLife: number };
type Cloud = { x: number; y: number; scale: number; speed: number; opacity: number; puffs: Array<{dx: number; dy: number; r: number}> };
type Firefly = { x: number; y: number; r: number; vx: number; vy: number; phase: number; speed: number; hue: number };
type Leaf = { x: number; y: number; size: number; vy: number; vx: number; rot: number; rotSpeed: number; opacity: number; green: boolean };
type Bubble = { x: number; y: number; r: number; vy: number; wobble: number; wobbleSpeed: number; opacity: number };
type Ember = { x: number; y: number; r: number; vy: number; vx: number; life: number; maxLife: number; hue: number };
type Ash = { x: number; y: number; r: number; vy: number; vx: number; opacity: number; wobble: number; wobbleSpeed: number };
type Scene = { build: () => void; draw: (timestamp: number) => void };

/** Original scene artwork and particle paths, shared by every page. */
function createScenes(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, reducedMotion: () => boolean): Record<string, Scene> {
  const sceneSpace = {
    stars: [] as Star[], meteors: [] as Meteor[], lastSpawn: 0, nextDelay: 2500,
    build() {
      this.stars = [];
      for (let i = 0; i < 280; i++) {
        const size = Math.random() < 0.15 ? Math.random() * 1.8 + 0.8
                   : Math.random() < 0.5  ? Math.random() * 0.9 + 0.3
                   :                        Math.random() * 0.5 + 0.1;
        this.stars.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          size, opacity: Math.random() * 0.5 + 0.3,
          twinkleSpeed: Math.random() * 0.008 + 0.002, twinklePhase: Math.random() * Math.PI * 2 });
      }
      this.meteors = [];
    },
    spawnMeteor() {
      const angle = (Math.random() * 90 - 60) * (Math.PI / 180);
      const speed = Math.random() * 1.2 + 0.8;
      const length = Math.random() * 120 + 80;
      let x, y;
      if (Math.random() < 0.6) { x = Math.random() * canvas.width * 1.2 - canvas.width * 0.1; y = -20; }
      else { x = -20; y = Math.random() * canvas.height * 0.6; }
      this.meteors.push({ x, y, vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + Math.abs(Math.cos(angle)) * 2,
        length, opacity: 0, life: 0, maxLife: Math.floor((canvas.width * 1.4) / speed) + 40 });
    },
    draw(ts: number) {
      for (const s of this.stars) {
        if (!reducedMotion()) s.twinklePhase += s.twinkleSpeed;
        const twinkle = 0.6 + 0.4 * Math.sin(s.twinklePhase);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.opacity * twinkle})`; ctx.fill();
      }
      if (reducedMotion()) return;
      if (this.meteors.length < 3 && ts - this.lastSpawn > this.nextDelay) {
        this.spawnMeteor(); this.lastSpawn = ts; this.nextDelay = 2500 + Math.random() * 3000;
      }
      for (let i = this.meteors.length - 1; i >= 0; i--) {
        const m = this.meteors[i];
        m.x += m.vx; m.y += m.vy; m.life++;
        if (m.life < 30) m.opacity = m.life / 30;
        else if (m.life > m.maxLife - 30) m.opacity = Math.max(0, (m.maxLife - m.life) / 30);
        else m.opacity = 1;
        if (m.life > m.maxLife || m.x > canvas.width + 100 || m.y > canvas.height + 100) { this.meteors.splice(i, 1); continue; }
        const len = Math.hypot(m.vx, m.vy);
        const tailX = m.x - (m.vx / len) * m.length; const tailY = m.y - (m.vy / len) * m.length;
        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, `rgba(92,197,255,0)`); grad.addColorStop(0.6, `rgba(92,197,255,${m.opacity * 0.6})`); grad.addColorStop(1, `rgba(255,255,255,${m.opacity})`);
        ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(m.x, m.y);
        ctx.strokeStyle = grad; ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.stroke();
        ctx.beginPath(); ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${m.opacity * 0.95})`; ctx.fill();
        const glow = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 8);
        glow.addColorStop(0, `rgba(92,197,255,${m.opacity * 0.4})`); glow.addColorStop(1, `rgba(92,197,255,0)`);
        ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI * 2); ctx.fillStyle = glow; ctx.fill();
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: DAYLIGHT (light) — drifting clouds
  // ════════════════════════════════════════════════════════════
  const sceneLight = {
    clouds: [] as Cloud[],
    build() {
      this.clouds = [];
      for (let i = 0; i < 9; i++) this.clouds.push(this._makeCloud(Math.random() * canvas.width));
    },
    _makeCloud(x: number) {
      return { x, y: Math.random() * canvas.height * 0.55,
        scale: Math.random() * 0.8 + 0.4, speed: Math.random() * 0.25 + 0.08,
        opacity: Math.random() * 0.25 + 0.1,
        puffs: Array.from({ length: Math.floor(Math.random() * 3) + 3 }, () => ({
          dx: (Math.random() - 0.5) * 80, dy: (Math.random() - 0.5) * 20, r: Math.random() * 28 + 18 })) };
    },
    draw() {
      for (const c of this.clouds) {
        if (!reducedMotion()) c.x += c.speed;
        if (c.x - 200 * c.scale > canvas.width) c.x = -200 * c.scale;
        ctx.save(); ctx.translate(c.x, c.y); ctx.scale(c.scale, c.scale);
        ctx.globalAlpha = c.opacity; ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (const p of c.puffs) { ctx.beginPath(); ctx.arc(p.dx, p.dy, p.r, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore(); ctx.globalAlpha = 1;
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: FOREST TERMINAL — fireflies + falling leaves
  // ════════════════════════════════════════════════════════════
  const sceneForest = {
    fireflies: [] as Firefly[], leaves: [] as Leaf[],
    build() {
      this.fireflies = [];
      for (let i = 0; i < 55; i++) {
        this.fireflies.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          r: Math.random() * 2.2 + 0.8, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
          phase: Math.random() * Math.PI * 2, speed: Math.random() * 0.025 + 0.01,
          hue: Math.random() < 0.7 ? 120 : 80 });
      }
      this.leaves = [];
      for (let i = 0; i < 18; i++) this.leaves.push(this._makeLeaf());
    },
    _makeLeaf() {
      return { x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height,
        size: Math.random() * 7 + 4, vy: Math.random() * 0.6 + 0.3, vx: (Math.random() - 0.5) * 0.5,
        rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.03,
        opacity: Math.random() * 0.4 + 0.2, green: Math.random() < 0.5 };
    },
    draw() {
      for (const f of this.fireflies) {
        if (!reducedMotion()) {
          f.phase += f.speed;
          f.x += f.vx + Math.sin(f.phase * 0.7) * 0.3; f.y += f.vy + Math.cos(f.phase * 0.5) * 0.3;
          if (f.x < 0) f.x = canvas.width; if (f.x > canvas.width) f.x = 0;
          if (f.y < 0) f.y = canvas.height; if (f.y > canvas.height) f.y = 0;
        }
        const glow = 0.4 + 0.6 * Math.abs(Math.sin(f.phase));
        const grd = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 5);
        grd.addColorStop(0, `hsla(${f.hue},100%,70%,${glow * 0.9})`);
        grd.addColorStop(0.4, `hsla(${f.hue},100%,60%,${glow * 0.4})`);
        grd.addColorStop(1, `hsla(${f.hue},100%,50%,0)`);
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r * 5, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${f.hue},100%,90%,${glow})`; ctx.fill();
      }
      for (const l of this.leaves) {
        if (!reducedMotion()) {
          l.y += l.vy; l.x += l.vx + Math.sin(l.rot) * 0.3; l.rot += l.rotSpeed;
          if (l.y > canvas.height + 20) { Object.assign(l, this._makeLeaf()); l.y = -20; }
        }
        ctx.save(); ctx.translate(l.x, l.y); ctx.rotate(l.rot);
        ctx.globalAlpha = l.opacity;
        ctx.fillStyle = l.green ? "#4ade80" : "#86efac";
        ctx.beginPath(); ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: DEEP OCEAN — rising bubbles + seafloor waves
  // ════════════════════════════════════════════════════════════
  const sceneOcean = {
    bubbles: [] as Bubble[], waveOffset: 0,
    build() {
      this.bubbles = [];
      for (let i = 0; i < 40; i++) this.bubbles.push(this._makeBubble());
      this.waveOffset = 0;
    },
    _makeBubble() {
      return { x: Math.random() * canvas.width, y: canvas.height + Math.random() * canvas.height,
        r: Math.random() * 5 + 2, vy: -(Math.random() * 0.6 + 0.3),
        wobble: Math.random() * Math.PI * 2, wobbleSpeed: Math.random() * 0.03 + 0.01,
        opacity: Math.random() * 0.35 + 0.1 };
    },
    draw() {
      if (!reducedMotion()) this.waveOffset += 0.008;
      const wh = canvas.height; const waveH = 60;
      ctx.beginPath(); ctx.moveTo(0, wh);
      for (let x = 0; x <= canvas.width; x += 4) {
        const y = wh - waveH * 0.4
          - Math.sin(x * 0.008 + this.waveOffset) * waveH * 0.3
          - Math.sin(x * 0.015 + this.waveOffset * 1.3) * waveH * 0.2;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(canvas.width, wh); ctx.closePath();
      const wg = ctx.createLinearGradient(0, wh - waveH, 0, wh);
      wg.addColorStop(0, "rgba(34,211,238,0.08)"); wg.addColorStop(1, "rgba(14,165,233,0.18)");
      ctx.fillStyle = wg; ctx.fill();
      for (const b of this.bubbles) {
        if (!reducedMotion()) {
          b.wobble += b.wobbleSpeed; b.y += b.vy; b.x += Math.sin(b.wobble) * 0.4;
          if (b.y < -20) Object.assign(b, this._makeBubble());
        }
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(34,211,238,${b.opacity})`; ctx.lineWidth = 1; ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200,245,255,${b.opacity * 0.6})`; ctx.fill();
      }
    },
  };

  // ════════════════════════════════════════════════════════════
  // SCENE: SUNSET EMBER — volcano silhouette + rising embers + ash
  // ════════════════════════════════════════════════════════════
  const sceneSunset = {
    embers: [] as Ember[], ashParticles: [] as Ash[],
    build() {
      this.embers = [];
      for (let i = 0; i < 60; i++) this.embers.push(this._makeEmber());
      this.ashParticles = [];
      for (let i = 0; i < 25; i++) this.ashParticles.push(this._makeAsh());
    },
    _makeEmber() {
      return { x: canvas.width * 0.35 + (Math.random() - 0.5) * canvas.width * 0.5,
        y: canvas.height + Math.random() * 80,
        r: Math.random() * 2.5 + 0.8, vy: -(Math.random() * 1.2 + 0.5), vx: (Math.random() - 0.5) * 0.8,
        life: 0, maxLife: Math.floor(Math.random() * 180 + 80), hue: Math.random() < 0.6 ? 20 : 40 };
    },
    _makeAsh() {
      return { x: Math.random() * canvas.width, y: -10 - Math.random() * canvas.height * 0.5,
        r: Math.random() * 1.5 + 0.5, vy: Math.random() * 0.3 + 0.1, vx: (Math.random() - 0.5) * 0.4,
        opacity: Math.random() * 0.3 + 0.1, wobble: Math.random() * Math.PI * 2, wobbleSpeed: Math.random() * 0.02 + 0.005 };
    },
    _drawVolcano() {
      const w = canvas.width; const h = canvas.height;
      // Left volcano
      ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w * 0.18, h * 0.52); ctx.lineTo(w * 0.28, h * 0.62); ctx.lineTo(w * 0.42, h); ctx.closePath();
      const g1 = ctx.createLinearGradient(0, h * 0.5, 0, h);
      g1.addColorStop(0, "rgba(30,8,2,0.85)"); g1.addColorStop(1, "rgba(15,4,1,0.95)");
      ctx.fillStyle = g1; ctx.fill();
      // Main volcano
      ctx.beginPath(); ctx.moveTo(w * 0.38, h); ctx.lineTo(w * 0.52, h * 0.38); ctx.lineTo(w * 0.56, h * 0.42); ctx.lineTo(w * 0.72, h); ctx.closePath();
      const g2 = ctx.createLinearGradient(w * 0.5, h * 0.35, w * 0.5, h);
      g2.addColorStop(0, "rgba(40,10,2,0.9)"); g2.addColorStop(1, "rgba(15,4,1,0.98)");
      ctx.fillStyle = g2; ctx.fill();
      // Far right hill
      ctx.beginPath(); ctx.moveTo(w * 0.65, h); ctx.lineTo(w * 0.82, h * 0.65); ctx.lineTo(w, h * 0.72); ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = "rgba(20,6,1,0.88)"; ctx.fill();
      // Crater glow
      const craterX = w * 0.535; const craterY = h * 0.39;
      const lg = ctx.createRadialGradient(craterX, craterY, 0, craterX, craterY, 60);
      lg.addColorStop(0, "rgba(255,120,0,0.55)"); lg.addColorStop(0.4, "rgba(255,60,0,0.25)"); lg.addColorStop(1, "rgba(255,30,0,0)");
      ctx.beginPath(); ctx.arc(craterX, craterY, 60, 0, Math.PI * 2); ctx.fillStyle = lg; ctx.fill();
      // Ground glow
      const gg = ctx.createLinearGradient(0, h * 0.85, 0, h);
      gg.addColorStop(0, "rgba(249,115,22,0)"); gg.addColorStop(1, "rgba(249,115,22,0.12)");
      ctx.fillRect(0, h * 0.85, w, h * 0.15);
    },
    draw() {
      this._drawVolcano();
      for (let i = this.embers.length - 1; i >= 0; i--) {
        const e = this.embers[i];
        if (!reducedMotion()) {
          e.x += e.vx + Math.sin(e.life * 0.05) * 0.3; e.y += e.vy; e.life++;
          if (e.life > e.maxLife || e.y < -20) { this.embers[i] = this._makeEmber(); continue; }
        }
        const progress = e.life / e.maxLife;
        const alpha = progress < 0.1 ? progress * 10 : progress > 0.7 ? (1 - progress) / 0.3 : 1;
        const grd = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 3);
        grd.addColorStop(0, `hsla(${e.hue},100%,70%,${alpha * 0.9})`);
        grd.addColorStop(0.5, `hsla(${e.hue},100%,55%,${alpha * 0.4})`);
        grd.addColorStop(1, `hsla(${e.hue},100%,40%,0)`);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 3, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${e.hue + 20},100%,85%,${alpha})`; ctx.fill();
      }
      for (const a of this.ashParticles) {
        if (!reducedMotion()) {
          a.wobble += a.wobbleSpeed; a.y += a.vy; a.x += a.vx + Math.sin(a.wobble) * 0.3;
          if (a.y > canvas.height + 10) { Object.assign(a, this._makeAsh()); a.y = -10; }
        }
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180,100,50,${a.opacity})`; ctx.fill();
      }
    },
  };

  return { dark: sceneSpace, light: sceneLight, forest: sceneForest, ocean: sceneOcean, sunset: sceneSunset };
}

/** Decorations never hide content and are paused when their output is not visible. */
export function initVisualEffects(documentRef: Document = document): Cleanup {
  const windowRef = documentRef.defaultView;
  if (!windowRef) return () => {};
  const cleanups: Cleanup[] = [];
  const listen = (target: EventTarget, name: string, callback: EventListener, options?: AddEventListenerOptions) => {
    target.addEventListener(name, callback, options);
    cleanups.push(() => target.removeEventListener(name, callback, options));
  };
  const motionMedia = typeof windowRef.matchMedia === 'function' ? windowRef.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reducedMotion = () => motionMedia?.matches ?? false;
  let disposed = false;

  // The YAML code panel uses the same token classes and line timing as the original.
  documentRef.querySelectorAll<HTMLElement>('[data-animate-lines]').forEach((block) => {
    if (block.dataset.linesReady) return;
    const original = block.textContent ?? '';
    block.dataset.linesReady = 'true';
    block.textContent = '';
    original.split('\n').forEach((line) => {
      const span = documentRef.createElement('span');
      span.className = 'code-line';
      if (/^(\s*)([a-z_]+):/i.test(line)) span.classList.add('keyword');
      else if (/"([^"]*)"|'([^']*)'/.test(line)) span.classList.add('string');
      else if (['name', 'role', 'focus', 'stack', 'Python', 'Docker', 'PostgreSQL', 'Java'].some((keyword) => line.includes(keyword))) span.classList.add('param');
      else if (line.trim().startsWith('-')) span.classList.add('function');
      span.textContent = line || ' ';
      block.appendChild(span);
    });
  });

  const revealTargets = [...documentRef.querySelectorAll<HTMLElement>('.section, .stat-card')];
  // CSS's default remains visible without JavaScript or IntersectionObserver.
  if (!reducedMotion() && typeof windowRef.IntersectionObserver === 'function') {
    const observer = new windowRef.IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('in-view'); observer.unobserve(entry.target);
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    revealTargets.forEach((target) => { target.classList.add('reveal-ready'); observer.observe(target); });
    cleanups.push(() => { observer.disconnect(); revealTargets.forEach((target) => target.classList.remove('reveal-ready')); });
  } else revealTargets.forEach((target) => target.classList.add('in-view'));

  const style = documentRef.createElement('style');
  style.dataset.visualEffects = 'true';
  style.textContent = '@keyframes ripple-animation { from { transform: scale(0); opacity: 1; } to { transform: scale(1); opacity: 0; } }';
  documentRef.head.appendChild(style);
  cleanups.push(() => style.remove());
  const ripples = new Set<HTMLElement>();
  const timers = new Set<number>();
  documentRef.querySelectorAll<HTMLElement>('.btn, .icon-button').forEach((button) => {
    listen(button, 'mousemove', ((event: MouseEvent) => {
      if (reducedMotion()) return;
      const bounds = button.getBoundingClientRect();
      if (bounds.width && bounds.height) {
        button.style.setProperty('--mouse-x', `${((event.clientX - bounds.left) / bounds.width) * 100}%`);
        button.style.setProperty('--mouse-y', `${((event.clientY - bounds.top) / bounds.height) * 100}%`);
      }
    }) as EventListener);
    listen(button, 'click', ((event: MouseEvent) => {
      if (reducedMotion() || button.classList.contains('nav-toggle')) return;
      const bounds = button.getBoundingClientRect();
      const size = Math.max(bounds.width, bounds.height);
      const ripple = documentRef.createElement('span');
      ripple.className = 'ripple'; ripple.setAttribute('aria-hidden', 'true');
      Object.assign(ripple.style, {
        width: `${size}px`, height: `${size}px`, left: `${event.clientX - bounds.left - size / 2}px`, top: `${event.clientY - bounds.top - size / 2}px`,
        position: 'absolute', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.5), transparent)', pointerEvents: 'none', animation: 'ripple-animation 0.6s ease-out forwards',
      });
      button.style.position = 'relative'; button.style.overflow = 'hidden'; button.appendChild(ripple); ripples.add(ripple);
      const timer = windowRef.setTimeout(() => { ripple.remove(); ripples.delete(ripple); timers.delete(timer); }, 600);
      timers.add(timer);
    }) as EventListener);
  });
  cleanups.push(() => { timers.forEach((timer) => windowRef.clearTimeout(timer)); ripples.forEach((ripple) => ripple.remove()); });

  const progress = documentRef.querySelector<HTMLElement>('.scroll-progress-vertical');
  const backToTop = documentRef.getElementById('back-to-top');
  const hero = documentRef.querySelector('.hero');
  const orbs = [...documentRef.querySelectorAll<HTMLElement>('.orb')];
  let scrollFrame = 0;
  const scrollUpdate = () => {
    scrollFrame = 0;
    const scrollTop = windowRef.scrollY;
    const range = documentRef.documentElement.scrollHeight - windowRef.innerHeight;
    if (progress) progress.style.height = `${range > 0 ? Math.min(100, Math.max(0, scrollTop / range * 100)) : 0}%`;
    if (backToTop) { backToTop.classList.toggle('visible', scrollTop > 400); backToTop.setAttribute('aria-hidden', String(scrollTop <= 400)); backToTop.tabIndex = scrollTop > 400 ? 0 : -1; }
    if (hero) orbs.forEach((orb) => { orb.style.transform = reducedMotion() ? '' : `translateY(${scrollTop * 0.5}px)`; });
  };
  listen(windowRef, 'scroll', () => { if (!scrollFrame) scrollFrame = windowRef.requestAnimationFrame(scrollUpdate); }, { passive: true });
  listen(windowRef, 'resize', () => { if (!scrollFrame) scrollFrame = windowRef.requestAnimationFrame(scrollUpdate); });
  if (backToTop) listen(backToTop, 'click', () => windowRef.scrollTo({ top: 0, behavior: reducedMotion() ? 'instant' : 'smooth' }));
  scrollUpdate();
  cleanups.push(() => windowRef.cancelAnimationFrame(scrollFrame));

  const canvas = documentRef.querySelector<HTMLCanvasElement>('#starfield');
  let ctx: CanvasRenderingContext2D | null = null;
  try { ctx = canvas?.getContext('2d') ?? null; } catch { /* Content stays functional without canvas support. */ }
  if (canvas && ctx) {
    const scenes = createScenes(canvas, ctx, reducedMotion);
    let currentKey = '';
    let activeScene: Scene = scenes.dark;
    let raf = 0;
    let lastFrame = 0;
    const paused = () => documentRef.hidden || documentRef.body.classList.contains('cr-game-open') || Boolean(documentRef.querySelector('dialog[open]'));
    const selectScene = (force = false) => {
      const key = documentRef.documentElement.dataset.theme || 'dark';
      if (force || key !== currentKey) { currentKey = key; activeScene = scenes[key] ?? scenes.dark; activeScene.build(); canvas.dataset.scene = key; }
    };
    const render = (timestamp: number) => { ctx!.clearRect(0, 0, canvas.width, canvas.height); activeScene.draw(timestamp); };
    const draw = (timestamp: number) => {
      raf = 0;
      if (disposed || paused() || reducedMotion()) return;
      // The legacy scene physics advance once per frame at a maximum of 60fps.
      if (timestamp - lastFrame >= 1000 / 60 - 1) { render(timestamp); lastFrame = timestamp; }
      raf = windowRef.requestAnimationFrame(draw);
    };
    const sync = () => {
      windowRef.cancelAnimationFrame(raf); raf = 0; selectScene();
      if (reducedMotion()) { canvas.dataset.animationState = 'reduced'; render(windowRef.performance.now()); }
      else if (paused()) canvas.dataset.animationState = 'paused';
      else { canvas.dataset.animationState = 'running'; lastFrame = 0; raf = windowRef.requestAnimationFrame(draw); }
    };
    const resize = () => { canvas.width = windowRef.innerWidth; canvas.height = windowRef.innerHeight; selectScene(true); sync(); };
    listen(windowRef, 'resize', resize);
    listen(documentRef, 'portfolio:themechange', sync);
    listen(documentRef, 'visibilitychange', sync);
    listen(windowRef, 'pagehide', () => { windowRef.cancelAnimationFrame(raf); raf = 0; canvas.dataset.animationState = 'paused'; });
    listen(windowRef, 'pageshow', sync);
    // Game lifecycle and native dialogs change independently of the background.
    const modalObserver = new windowRef.MutationObserver(sync);
    modalObserver.observe(documentRef.body, { attributes: true, attributeFilter: ['class'] });
    documentRef.querySelectorAll('dialog').forEach((dialog) => modalObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
    if (motionMedia?.addEventListener) {
      motionMedia.addEventListener('change', sync);
      cleanups.push(() => motionMedia.removeEventListener('change', sync));
    }
    resize();
    cleanups.push(() => { modalObserver.disconnect(); windowRef.cancelAnimationFrame(raf); canvas.dataset.animationState = 'paused'; });
  }
  return () => { if (disposed) return; disposed = true; cleanups.reverse().forEach((cleanup) => cleanup()); };
}
