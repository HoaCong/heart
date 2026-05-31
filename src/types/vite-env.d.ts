// Type declarations for Vite's ?raw string imports (e.g., GLSL shader files)
declare module "*.glsl?raw" {
  const content: string;
  export default content;
}

// Static asset URL imports
declare module "*.png?url" {
  const url: string;
  export default url;
}
