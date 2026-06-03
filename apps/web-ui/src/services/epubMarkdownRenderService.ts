import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownAsync } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

export class EpubMarkdownRenderService {
  static async renderMarkdownBody(markdown: string): Promise<string> {
    const rendered = await MarkdownAsync({
      children: markdown,
      remarkPlugins: [remarkGfm],
      rehypePlugins: [rehypeRaw],
    });

    return this.normalizeStaticMarkup(renderToStaticMarkup(rendered));
  }

  private static normalizeStaticMarkup(markup: string): string {
    return markup
      .replace(/<link rel="preload" as="image" href="[^"]*"\/>/g, "")
      .replace(/src="images\//g, 'src="../images/');
  }
}
