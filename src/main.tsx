
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PostHogProvider } from "@posthog/react";
import App from "./app/App.tsx";
import "./styles/index.css";

const posthogToken = import.meta.env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
const options = {
  api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
  defaults: "2026-01-30",
} as const;

const appTree = posthogToken ? (
  <PostHogProvider apiKey={posthogToken} options={options}>
    <App />
  </PostHogProvider>
) : (
  <App />
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {appTree}
  </StrictMode>,
);
  
