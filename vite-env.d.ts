// Fixes for missing vite/client types and process redeclaration
declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY?: string;
    [key: string]: any;
  }
}
