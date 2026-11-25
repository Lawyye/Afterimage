// Анимированные световые эффекты поверх фонов (координаты сцены 1920×1080).
export interface BgFx {
  type: 'glow' | 'flicker' | 'police' | 'screen' | 'haze' | 'candle' | 'dim' | 'pass';
  x: number; y: number; w: number; h: number;
  color?: string; color2?: string; speed?: number; delay?: number; opacity?: number;
}

const candle = (x: number, y: number, d = 0): BgFx => ({ type: 'candle', x: x - 60, y: y - 60, w: 120, h: 120, color: 'rgba(255,170,80,0.9)', speed: 1.7 + (d % 3) * 0.4, delay: d * 0.37 });

export const BG_FX: Record<string, BgFx[]> = {
  eva_apt: [
    { type: 'glow', x: 1700, y: 300, w: 380, h: 380, color: 'rgba(255,170,80,0.55)', speed: 6 },
    { type: 'screen', x: 1625, y: 445, w: 120, h: 150, color: 'rgba(120,190,255,0.25)', speed: 0.18 },
    { type: 'haze', x: 830, y: 0, w: 700, h: 600, color: 'rgba(120,140,255,0.12)', speed: 40 },
  ],
  courtyard: [
    { type: 'police', x: 295, y: 60, w: 170, h: 170, color: 'rgba(255,40,60,0.9)', color2: 'rgba(40,90,255,0.9)', speed: 1.1 },
    { type: 'police', x: 1640, y: 315, w: 170, h: 170, color: 'rgba(40,90,255,0.9)', color2: 'rgba(255,40,60,0.9)', speed: 1.3 },
    { type: 'police', x: 1100, y: 640, w: 140, h: 140, color: 'rgba(255,40,60,0.8)', color2: 'rgba(40,90,255,0.8)', speed: 0.9 },
    { type: 'police', x: 0, y: 760, w: 1920, h: 320, color: 'rgba(255,40,60,0.14)', color2: 'rgba(40,90,255,0.16)', speed: 1.1 },
  ],
  mira_apt: [
    { type: 'glow', x: 110, y: 230, w: 160, h: 160, color: 'rgba(80,230,220,0.6)', speed: 2.2 },
    { type: 'glow', x: 0, y: 640, w: 1100, h: 440, color: 'rgba(255,30,40,0.35)', speed: 1.6 },
    { type: 'flicker', x: 1330, y: 120, w: 420, h: 620, color: 'rgba(200,230,255,0.22)', speed: 5 },
    { type: 'haze', x: 1150, y: 0, w: 520, h: 760, color: 'rgba(230,240,255,0.10)', speed: 14 },
  ],
  canal: [
    { type: 'flicker', x: 1700, y: 80, w: 240, h: 360, color: 'rgba(140,255,170,0.45)', speed: 4.3 },
    { type: 'glow', x: 880, y: -60, w: 200, h: 200, color: 'rgba(255,60,200,0.6)', speed: 3 },
    { type: 'flicker', x: 680, y: 0, w: 160, h: 240, color: 'rgba(255,180,60,0.5)', speed: 6.1 },
    { type: 'glow', x: 1480, y: 520, w: 200, h: 180, color: 'rgba(80,200,255,0.6)', speed: 3.4 },
    { type: 'haze', x: 380, y: 260, w: 700, h: 260, color: 'rgba(200,190,220,0.14)', speed: 22 },
  ],
  den: [
    { type: 'glow', x: -120, y: 60, w: 900, h: 700, color: 'rgba(40,220,230,0.28)', speed: 5 },
    { type: 'screen', x: 800, y: 380, w: 170, h: 130, color: 'rgba(255,150,60,0.3)', speed: 0.16 },
    { type: 'screen', x: 1150, y: 430, w: 150, h: 120, color: 'rgba(255,150,60,0.3)', speed: 0.21 },
    { type: 'flicker', x: 1340, y: -40, w: 200, h: 200, color: 'rgba(255,180,90,0.5)', speed: 7 },
  ],
  mnema: [
    { type: 'haze', x: 0, y: 150, w: 1500, h: 520, color: 'rgba(255,255,255,0.18)', speed: 50 },
    { type: 'glow', x: 1530, y: 40, w: 260, h: 260, color: 'rgba(255,210,120,0.4)', speed: 5 },
  ],
  columbarium: [
    { type: 'glow', x: 1700, y: 330, w: 300, h: 320, color: 'rgba(255,200,140,0.55)', speed: 3.2 },
    { type: 'screen', x: 830, y: 620, w: 110, h: 80, color: 'rgba(160,200,255,0.4)', speed: 0.25 },
    candle(160, 990, 0), candle(330, 960, 1), candle(480, 930, 2), candle(1440, 930, 3), candle(1600, 960, 4), candle(1760, 1000, 5), candle(700, 900, 6), candle(1230, 900, 7),
  ],
  hall: [
    { type: 'glow', x: 640, y: 0, w: 640, h: 1080, color: 'rgba(120,255,150,0.30)', speed: 3.6 },
    { type: 'glow', x: 840, y: 700, w: 240, h: 380, color: 'rgba(160,255,180,0.35)', speed: 2.4, delay: 1 },
  ],
  stairwell: [
    { type: 'dim', x: 0, y: 0, w: 1920, h: 1080, color: 'rgba(0,0,0,0.38)', speed: 4.5 },
    { type: 'flicker', x: 900, y: -200, w: 700, h: 500, color: 'rgba(220,255,160,0.25)', speed: 4.5 },
  ],
  taxi: [
    { type: 'pass', x: 0, y: 60, w: 1920, h: 520, color: 'rgba(255,60,200,0.25)', speed: 3.2 },
    { type: 'pass', x: 0, y: 60, w: 1920, h: 520, color: 'rgba(255,170,60,0.22)', speed: 4.7, delay: 1.6 },
    { type: 'glow', x: 560, y: 560, w: 800, h: 300, color: 'rgba(90,160,255,0.2)', speed: 4 },
  ],
  dawn: [
    { type: 'glow', x: 1160, y: 140, w: 420, h: 420, color: 'rgba(255,200,170,0.5)', speed: 8 },
    { type: 'haze', x: 0, y: 450, w: 1920, h: 400, color: 'rgba(255,230,240,0.16)', speed: 60 },
  ],
  key_art: [
    { type: 'glow', x: 1500, y: 80, w: 220, h: 220, color: 'rgba(120,230,255,0.55)', speed: 4 },
  ],
  cg_door: [
    { type: 'flicker', x: 400, y: 0, w: 900, h: 700, color: 'rgba(200,230,255,0.2)', speed: 3.2 },
  ],
  cg_reading: [
    { type: 'glow', x: 300, y: 0, w: 500, h: 420, color: 'rgba(90,230,255,0.4)', speed: 2.6 },
    { type: 'police', x: 0, y: 0, w: 1920, h: 400, color: 'rgba(255,40,60,0.15)', color2: 'rgba(40,90,255,0.15)', speed: 1.2 },
  ],
  cg_stairs: [
    { type: 'flicker', x: 500, y: -200, w: 900, h: 700, color: 'rgba(230,255,170,0.22)', speed: 3.1 },
  ],
};
