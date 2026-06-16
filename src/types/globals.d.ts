// Global ambient declarations for non-TS imports (CSS, etc.)
declare module '*.css' {
  const content: { [className: string]: string };
  export default content;
}
