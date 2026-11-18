import ReactDOM from "react-dom/client";
import App from "./App";

// No <StrictMode>: its double-invoked effects would replay the mascot's entrance animation.
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<App />);
