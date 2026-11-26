declare module 'virtual:story' {
  const json: unknown;
  export default json;
}
declare module '*.json' {
  const v: unknown;
  export default v;
}
declare module 'virtual:assets' {
  const map: Record<string, string>;
  export default map;
}
declare module 'virtual:voice' {
  /** озвучка: ключ → data:audio/mpeg;base64,… (встроена во все сборки) */
  const map: Record<string, string>;
  export default map;
}
