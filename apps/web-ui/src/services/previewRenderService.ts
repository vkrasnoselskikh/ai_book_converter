import path from "path";

export interface PreviewImage {
  id: string;
  width: number;
  height: number;
  imageBase64?: string;
  fileName?: string;
  mimeType?: string;
  source_path?: string;
}

export interface PreviewTable {
  id: string;
  contentHtml: string;
}

export interface PreviewPage {
  pageIndex: number;
  pageNumber?: number;
  anchorId?: string;
  markdown: string;
  images: PreviewImage[];
  tables: PreviewTable[];
}

export interface PreviewEndnote {
  noteId: string;
  refId: string;
  marker: string | null;
  text: string;
  linked: boolean;
}

export class PreviewRenderService {
  // Simple markdown to HTML compiler
  static compileMarkdown(markdown: string): string {
    let html = markdown.trim();

    // 1. Double newlines to paragraphs
    const paragraphs = html.split(/\n\n+/);
    const compiledParagraphs = paragraphs.map((p) => {
      let text = p.trim();
      if (!text) return "";

      // Headers
      if (text.startsWith("# ")) {
        return `<h1>${this.compileInline(text.substring(2))}</h1>`;
      }
      if (text.startsWith("## ")) {
        return `<h2>${this.compileInline(text.substring(3))}</h2>`;
      }
      if (text.startsWith("### ")) {
        return `<h3>${this.compileInline(text.substring(4))}</h3>`;
      }

      // Tables block
      if (
        text.startsWith("<table") ||
        text.includes("<tr") ||
        text.includes("<td")
      ) {
        return text; // Pass through HTML tables directly
      }

      // Lists
      if (text.startsWith("- ") || text.startsWith("* ")) {
        const listItems = text.split(/\n[-*]\s+/).map((item) => {
          const itemText =
            item.startsWith("- ") || item.startsWith("* ")
              ? item.substring(2)
              : item;
          return `<li>${this.compileInline(itemText)}</li>`;
        });
        return `<ul>\n${listItems.join("\n")}\n</ul>`;
      }

      // Normal paragraph
      return `<p>${this.compileInline(text)}</p>`;
    });

    return compiledParagraphs.filter((p) => p !== "").join("\n\n");
  }

  // Helper for inline markdown elements (bold, italic, links)
  private static compileInline(text: string): string {
    let result = text;
    // Bold
    result = result.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
    // Italic
    result = result.replace(/\*([\s\S]+?)\*/g, "<em>$1</em>");
    // Images
    result = result.replace(
      /!\[([\s\S]+?)\]\(([\s\S]+?)\)/g,
      '<img src="$2" alt="$1" />',
    );
    // Links / Anchors
    result = result.replace(
      /\[([\s\S]+?)\]\(([\s\S]+?)\)/g,
      '<a href="$2">$1</a>',
    );
    return result;
  }

  // Replaces table and image placeholders, compiles markdown, and wraps pages in sections
  static renderBodySections(
    pages: PreviewPage[],
    imageHrefPrefix: string,
  ): string {
    const renderedSections: string[] = [];

    for (const page of pages) {
      let pageMarkdown = this.replaceTablePlaceholders(
        page.markdown,
        page.tables,
      );
      pageMarkdown = this.replaceImagePlaceholders(
        pageMarkdown,
        page.images,
        imageHrefPrefix,
      );

      let pageHtml = this.compileMarkdown(pageMarkdown);
      pageHtml = this.normalizeImageSources(pageHtml, imageHrefPrefix);

      const anchorId = page.anchorId || (page.pageNumber ? `page-${page.pageNumber}` : `page-${page.pageIndex + 1}`);
      renderedSections.push(`<section id="${anchorId}">\n${pageHtml}\n</section>`);
    }

    return renderedSections.join("\n\n");
  }

  // Renders standard endnotes HTML section
  static renderEndnotesHtml(endnotes: PreviewEndnote[]): string {
    if (!endnotes || endnotes.length === 0) {
      return "";
    }
    const lines = ['<section id="endnotes">', "<h2>Endnotes</h2>", "<ol>"];
    for (const endnote of endnotes) {
      const backlink = endnote.linked
        ? ` <a href="#${endnote.refId}">↩</a>`
        : "";
      const marker = endnote.marker !== null ? `[${endnote.marker}] ` : "";
      lines.push(
        `<li id="${endnote.noteId}">${marker}${endnote.text}${backlink}</li>`,
      );
    }
    lines.push("</ol>", "</section>");
    return lines.join("\n");
  }

  // Wrap sections into final single document HTML
  static renderBookHtml(bodyHtml: string, endnotesHtml: string): string {
    return [
      "<html>",
      "<body>",
      bodyHtml,
      endnotesHtml,
      "</body>",
      "</html>",
    ].join("\n");
  }

  static replaceTablePlaceholders(
    markdown: string,
    tables: PreviewTable[],
  ): string {
    let updated = markdown;
    for (const table of tables) {
      const placeholder = `[${table.id}](${table.id})`;
      const tableHtml = table.contentHtml.trim();
      if (!tableHtml) continue;
      updated = updated.replace(placeholder, `\n\n${tableHtml}\n\n`);
    }
    return updated;
  }

  static replaceImagePlaceholders(
    markdown: string,
    images: PreviewImage[],
    imageHrefPrefix: string,
  ): string {
    let updated = markdown;
    for (const img of images) {
      if (!img.imageBase64 && !img.source_path) {
        continue;
      }

      const imgName = img.source_path
        ? path.basename(img.source_path)
        : (img.fileName || `${img.id}.png`);
      const markdownImage = `![${img.id}](${imageHrefPrefix}/${imgName})`;
      const targets = Array.from(
        new Set([img.id, img.fileName, imgName, img.source_path ? path.basename(img.source_path) : null].filter(Boolean) as string[]),
      );

      for (const target of targets) {
        const escapedTarget = this.escapeRegExp(target);
        updated = updated.replace(
          new RegExp(`!\\[([^\\]]*)\\]\\(${escapedTarget}\\)`, "g"),
          markdownImage,
        );
      }
    }
    return updated;
  }

  static normalizeImageSources(html: string, imageHrefPrefix: string): string {
    let normalized = html;
    normalized = normalized.replace(/src="\.\.\//g, 'src="');
    if (imageHrefPrefix === "../images") {
      return normalized;
    }
    return normalized.replace(/src="images\//g, `src="${imageHrefPrefix}/`);
  }

  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
