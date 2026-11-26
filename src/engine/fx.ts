// Визуальные эффекты: дождь, плёночный шум, глитч.
import { settings, onSettings } from './settings';

interface Drop { x: number; y: number; l: number; v: number; a: number; }
interface Splash { x: number; y: number; t: number; }

export class Weather {
  private ctx: CanvasRenderingContext2D;
  private drops: Drop[] = [];
  private splashes: Splash[] = [];
  mode: 'off' | 'light' | 'heavy' | 'memory' = 'off';
  private target = 0;
  private density = 0;
  private wind = -0.18;
  private last = 0;
  private lightning = 0;
  private cleared = true;
  constructor(private canvas: HTMLCanvasElement) {
    canvas.width = 960;
    canvas.height = 540;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    requestAnimationFrame((t) => this.loop(t));
  }
  set(mode: Weather['mode']) {
    this.mode = mode;
    const k = document.getElementById('stage')?.classList.contains('lowfx') ? 0.5 : 1;
    this.target = Math.round((mode === 'heavy' ? 520 : mode === 'light' ? 200 : mode === 'memory' ? 260 : 0) * k);
  }
  flashLightning() {
    this.lightning = 1;
  }
  private spawn(): Drop {
    return { x: Math.random() * 2100 - 90, y: -Math.random() * 1100, l: 18 + Math.random() * 40, v: 1500 + Math.random() * 900, a: 0.08 + Math.random() * 0.22 };
  }
  private loop(t: number) {
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016);
    this.last = t;
    this.density += (this.target - this.density) * Math.min(1, dt * 1.5);
    const n = Math.round(this.density);
    while (this.drops.length < n) this.drops.push(this.spawn());
    if (this.drops.length > n) this.drops.length = n;
    const c = this.ctx;
    if (n === 0 && this.lightning <= 0) {
      if (!this.cleared) { c.clearRect(0, 0, 1920, 1080); this.cleared = true; }
      requestAnimationFrame((tt) => this.loop(tt));
      return;
    }
    this.cleared = false;
    c.clearRect(0, 0, 1920, 1080);
    if (this.lightning > 0) {
      c.fillStyle = `rgba(200,220,255,${this.lightning * 0.35})`;
      c.fillRect(0, 0, 1920, 1080);
      this.lightning = Math.max(0, this.lightning - dt * 2.2);
    }
    if (n > 0) {
      const memory = this.mode === 'memory';
      c.lineCap = 'round';
      c.lineWidth = memory ? 2 : 2.6;
      for (const d of this.drops) {
        d.y += d.v * dt * (memory ? -0.35 : 1); // в памяти дождь идёт вверх
        d.x += d.v * this.wind * dt * (memory ? -0.35 : 1);
        if (!memory && d.y > 1080) {
          if (Math.random() < 0.35) this.splashes.push({ x: d.x, y: 960 + Math.random() * 120, t: 0 });
          Object.assign(d, this.spawn(), { y: -40 });
        } else if (memory && d.y < -60) Object.assign(d, this.spawn(), { y: 1100 + Math.random() * 200 });
        c.strokeStyle = memory ? `rgba(255,190,190,${d.a})` : `rgba(190,210,230,${d.a})`;
        c.beginPath();
        c.moveTo(d.x, d.y);
        c.lineTo(d.x - d.l * this.wind, d.y - d.l);
        c.stroke();
      }
      c.lineWidth = 1;
      for (let i = this.splashes.length - 1; i >= 0; i--) {
        const s = this.splashes[i];
        s.t += dt;
        if (s.t > 0.25) { this.splashes.splice(i, 1); continue; }
        c.strokeStyle = `rgba(200,220,235,${0.25 * (1 - s.t / 0.25)})`;
        c.beginPath();
        c.ellipse(s.x, s.y, 4 + s.t * 40, 1 + s.t * 6, 0, 0, Math.PI * 2);
        c.stroke();
      }
    }
    requestAnimationFrame((tt) => this.loop(tt));
  }
}

export class Noise {
  // Мелкое плёночное зерно: один тайл 256×256, анимация смещением фона (без нагрузки на CPU)
  constructor(private el: HTMLElement) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 120;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    el.style.backgroundImage = `url(${c.toDataURL('image/png')})`;
    onSettings(() => this.apply());
  }
  boost = 0;
  apply() {
    const stage = document.getElementById('stage')!;
    stage.style.setProperty('--noise', String(0.05 + settings.fx * 0.07 + this.boost));
    stage.style.setProperty('--scan', String(0.06 + settings.fx * 0.22));
    stage.classList.toggle('no-fx', settings.fx <= 0.01);
  }
}

export class Glitch {
  private ctx: CanvasRenderingContext2D;
  private until = 0;
  private strength = 0;
  constructor(private canvas: HTMLCanvasElement, private world: HTMLElement, private stage: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    const tick = (t: number) => {
      this.draw(t);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  burst(strength = 0.7, ms = 450) {
    if (!settings.glitch) strength *= 0.25;
    this.strength = Math.max(this.strength, strength);
    this.until = Math.max(this.until, performance.now() + ms);
  }
  private draw(t: number) {
    const c = this.ctx;
    const on = t < this.until;
    this.canvas.classList.toggle('on', on);
    this.stage.classList.toggle('rgb-split', on && this.strength > 0.3);
    if (!on) {
      if (this.world.style.translate) this.world.style.translate = '';
      this.strength = 0;
      return;
    }
    c.clearRect(0, 0, 960, 540);
    const s = this.strength;
    const n = Math.round(4 + s * 16);
    for (let i = 0; i < n; i++) {
      const y = Math.random() * 540;
      const h = 2 + Math.random() * 30 * s;
      const hue = Math.random() < 0.5 ? '255,40,60' : Math.random() < 0.5 ? '60,230,255' : '240,240,240';
      c.fillStyle = `rgba(${hue},${0.08 + Math.random() * 0.25 * s})`;
      c.fillRect(Math.random() * 200 - 100, y, 960 * (0.3 + Math.random()), h);
    }
    if (Math.random() < 0.5 * s) {
      for (let i = 0; i < 40 * s; i++) {
        c.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`;
        c.fillRect(Math.random() * 960, Math.random() * 540, 2 + Math.random() * 24, 2);
      }
    }
    if (settings.glitch) this.world.style.translate = `${(Math.random() - 0.5) * 26 * s}px ${(Math.random() - 0.5) * 6 * s}px`;
  }
}
