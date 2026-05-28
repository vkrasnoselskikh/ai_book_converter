import ReactDOMServer from "react-dom/server";
import { App } from "../components/App.jsx";
import { ThemeProvider } from "../components/ThemeContext.jsx";

export function render(_url: string, initialState: any): string {
  return ReactDOMServer.renderToString(
    <ThemeProvider>
      <App initialState={initialState} />
    </ThemeProvider>,
  );
}
