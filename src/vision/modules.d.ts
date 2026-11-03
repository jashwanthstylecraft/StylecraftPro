// Vite "?url" imports (the project has no vite/client types).
declare module '*?url' {
  const url: string
  export default url
}
