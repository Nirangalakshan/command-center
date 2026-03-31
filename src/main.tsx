import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// 👇 Add this temporarily to check your .env
console.log("Supabase URL:", import.meta.env.VITE_SUPABASE_URL);
console.log("Supabase KEY:", import.meta.env.VITE_SUPABASE_ANON_KEY);
console.log("VITE_SUPABASE_PROJECT_ID", import.meta.env.VITE_SUPABASE_PROJECT_ID);

createRoot(document.getElementById("root")!).render(<App />);
