// Интерактивные зоны осмотра (координаты сцены 1920×1080): [x, y, w, h]
export interface Hotspot { label: string; sub?: string; rect: [number, number, number, number]; dot?: [number, number]; }

export const HOTSPOTS: Record<string, Record<string, Hotspot>> = {
  eva_apt: {
    coat: { label: 'Пальто', sub: 'У двери', rect: [40, 90, 165, 700], dot: [118, 330] },
    mirror: { label: 'Зеркало', rect: [282, 60, 86, 690], dot: [325, 330] },
    window: { label: 'Окно', sub: 'Порт-Ирис', rect: [840, 20, 680, 420], dot: [1180, 230] },
    bed: { label: 'Кровать', rect: [430, 470, 760, 320], dot: [760, 600] },
    terminal: { label: 'Терминал', rect: [1615, 440, 140, 150], dot: [1685, 515] },
    pills: { label: 'Флакон', sub: 'Снотворное', rect: [1722, 592, 60, 72], dot: [1750, 625] },
    photo: { label: 'Фотография', sub: 'На полке', rect: [1765, 0, 125, 185], dot: [1825, 95] },
    safe: { label: 'Сейф', sub: 'Ящик стола', rect: [1620, 748, 118, 108], dot: [1678, 800] },
  },
  mira_apt: {
    door: { label: 'Панель двери', sub: 'Журнал замка, камеры', rect: [110, 220, 140, 180], dot: [178, 310] },
    photo: { label: 'Фотография', sub: 'Книжная полка', rect: [470, 340, 100, 90], dot: [520, 385] },
    cat: { label: 'Лежанка', rect: [370, 545, 130, 95], dot: [435, 590] },
    terminal: { label: 'Терминал', rect: [670, 380, 270, 140], dot: [800, 450] },
    cups: { label: 'Две чашки', rect: [1060, 470, 210, 75], dot: [1160, 505] },
    glass: { label: 'Разбитое стекло', rect: [1385, 40, 170, 600], dot: [1470, 330] },
    view: { label: 'Вид на город', sub: 'Башня «Мнемы»', rect: [1720, 20, 115, 360], dot: [1775, 200] },
    painting: { label: 'Картина', rect: [640, 30, 190, 340], dot: [735, 200] },
  },
  columbarium: {
    niche: { label: 'Ниша 1147', sub: 'Соня Рейн', rect: [1785, 360, 130, 265], dot: [1850, 490] },
    kiosk: { label: 'Терминал', sub: 'Просмотр записей', rect: [815, 615, 150, 190], dot: [890, 680] },
    wall: { label: 'Стена ниш', rect: [0, 0, 480, 760], dot: [240, 380] },
    flowers: { label: 'Лилии', rect: [1690, 760, 220, 180], dot: [1800, 850] },
    roof: { label: 'Стеклянная крыша', rect: [710, 0, 380, 180], dot: [900, 80] },
  },
};
