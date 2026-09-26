/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PROXY?: string;
  readonly VITE_CALLBACK_URL?: string;
  readonly VITE_CALLBACK_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
