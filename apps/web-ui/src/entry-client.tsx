import "./index.css";
import ReactDOM from "react-dom/client";
import { App } from "./components/App.jsx";
import { ThemeProvider } from "./components/ThemeContext.jsx";

const rootElement = document.getElementById("root");
if (rootElement) {
  ReactDOM.hydrateRoot(
    rootElement,
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}
