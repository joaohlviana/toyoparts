/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: string;
  readonly VITE_PUBLIC_POSTHOG_HOST: string;
  readonly VITE_PUBLIC_GOOGLE_ADS_TAG_ID?: string;
  readonly VITE_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL?: string;
  readonly VITE_PUBLIC_GOOGLE_ADS_WHATSAPP_LEAD_LABEL?: string;
  readonly VITE_PUBLIC_META_PIXEL_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
