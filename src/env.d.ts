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
