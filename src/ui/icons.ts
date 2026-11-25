// Линейные иконки улик (интерфейсная графика).
const P: Record<string, string> = {
  coat: '<path d="M22 8l10 6 10-6 8 6-4 10 3 32H15l3-32-4-10z"/><path d="M32 14v42M26 30h-6M44 30h-6"/>',
  pistol: '<path d="M8 22h40l4 4v6H34l-4 4v14h-10l2-14-6-4H8z"/><circle cx="44" cy="27" r="1.5"/>',
  photo: '<rect x="12" y="10" width="40" height="44" rx="2"/><rect x="17" y="15" width="30" height="26"/><circle cx="32" cy="25" r="5"/><path d="M22 41c2-6 18-6 20 0"/>',
  note: '<path d="M16 8h24l8 8v40H16z"/><path d="M40 8v8h8M22 26h20M22 33h20M22 40h14"/>',
  pills: '<rect x="20" y="16" width="24" height="38" rx="3"/><rect x="18" y="8" width="28" height="9" rx="2"/><path d="M24 30h16"/>',
  terminal: '<rect x="8" y="12" width="48" height="32" rx="2"/><path d="M14 22l6 5-6 5M24 34h10M24 52h16M32 44v8"/>',
  eye: '<path d="M6 32s10-16 26-16 26 16 26 16-10 16-26 16S6 32 6 32z"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="2"/>',
  quote: '<path d="M14 18h36v24H30l-10 8v-8h-6z"/><path d="M22 26h20M22 33h14"/>',
  glass: '<path d="M10 10h44v44H10z"/><path d="M30 10l-6 16 10 6-8 22M24 26l-14 4M34 32l20-6"/>',
  cup: '<path d="M14 24h30v14a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12z"/><path d="M44 28h4a5 5 0 0 1 0 10h-4M24 10c-2 4 2 6 0 10M32 10c-2 4 2 6 0 10"/>',
  door: '<rect x="16" y="8" width="32" height="48"/><circle cx="42" cy="32" r="2"/><rect x="22" y="14" width="10" height="6"/>',
  camera: '<path d="M8 22h30l8-6v24l-8-6H8z"/><path d="M14 34v14M10 48h8"/><circle cx="20" cy="28" r="3"/>',
  retouch: '<circle cx="24" cy="30" r="12"/><path d="M34 40l14 14M36 18l12-8 4 4-8 12"/><path d="M18 30h12"/>',
  seal: '<circle cx="32" cy="30" r="16"/><path d="M24 30l6 6 10-12"/><path d="M24 44l-4 14 12-6 12 6-4-14"/>',
  brain: '<path d="M32 12c-6-4-16 0-16 8-6 2-6 12 0 14-2 8 6 14 14 10 2 4 4 4 4 4V12z"/><path d="M32 12c6-4 16 0 16 8 6 2 6 12 0 14 2 8-6 14-14 10"/><path d="M24 28h4M38 34h4"/>',
  request: '<path d="M14 8h28l8 8v40H14z"/><path d="M20 24h24M20 31h24M20 38h12"/><path d="M34 46l4 4 8-8"/>',
  person: '<circle cx="32" cy="20" r="9"/><path d="M14 54c2-12 10-18 18-18s16 6 18 18"/>',
  message: '<rect x="8" y="12" width="48" height="32" rx="3"/><path d="M8 14l24 16 24-16"/><path d="M20 44l-6 10"/>',
  log: '<rect x="12" y="8" width="40" height="48" rx="2"/><path d="M18 18h28M18 25h28M18 32h28M18 39h18"/><path d="M40 44l8 8"/>',
  hand: '<path d="M20 58V34l-6-8 4-4 8 8V12a3 3 0 0 1 6 0v16-20a3 3 0 0 1 6 0v20-16a3 3 0 0 1 6 0v18-10a3 3 0 0 1 6 0v22c0 10-6 16-14 16z"/>',
};

export function icon(name: string, color = 'currentColor'): string {
  return `<svg viewBox="0 0 64 64" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${P[name] ?? P.note}</svg>`;
}
