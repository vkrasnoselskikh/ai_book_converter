import "./index.css";
import ReactDOM from "react-dom/client";
import { App } from "./components/App.js";
import { ThemeProvider } from "./components/ThemeContext.js";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.hydrateRoot(
    rootElement,
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}
