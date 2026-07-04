// Entry de la app. Arranca la UI cuando el DOM está disponible.
import { init } from "./ui.js";

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
