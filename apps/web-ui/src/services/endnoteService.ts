export interface Endnote {
  noteId: string;
  refId: string;
  marker: string | null;
  text: string;
  pageIndex: number;
  linked: boolean;
}

export interface RewrittenPage {
  pageIndex: number;
  headerBlocks: string[];
  bodyMarkdown: string;
  footerBlocks: string[];
  images: any[];
  tables: any[];
  warnings: string[];
}

export class EndnoteService {
  private static FOOTNOTE_MARKER_PATTERN = /^\s*\[?(\d+)\]?[.)]?\s*/;

  // Moves page footers into structured endnotes and links them inside the page body text
  static buildEndnotes(pages: any[]): { rewrittenPages: any[]; endnotes: Endnote[] } {
    const rewrittenPages: any[] = [];
    const endnotes: Endnote[] = [];
    let noteCounter = 1;

    for (const page of pages) {
      let bodyMarkdown = page.markdown || page.bodyMarkdown || "";
      const footerBlocks: string[] = page.footers || page.footerBlocks || [];

      for (const footerBlock of footerBlocks) {
        const marker = this.extractMarker(footerBlock);
        const noteId = `endnote-${noteCounter}`;
        const refId = `endnote-ref-${noteCounter}`;
        let linked = false;

        if (marker !== null) {
          const candidates = [`[${marker}]`, `^${marker}`, `(${marker})`];
          for (const candidate of candidates) {
            if (bodyMarkdown.includes(candidate)) {
              bodyMarkdown = bodyMarkdown.replace(
                candidate,
                `<sup id="${refId}"><a href="#${noteId}">${candidate}</a></sup>`
              );
              linked = true;
              break;
            }
          }
        }

        endnotes.push({
          noteId,
          refId,
          marker,
          text: this.stripMarker(footerBlock),
          pageIndex: page.pageIndex,
          linked
        });

        noteCounter++;
      }

      rewrittenPages.push({
        ...page,
        markdown: bodyMarkdown,
        bodyMarkdown, // support both fields
        endnotesLinked: true
      });
    }

    return { rewrittenPages, endnotes };
  }

  private static extractMarker(footerText: string): string | null {
    const match = this.FOOTNOTE_MARKER_PATTERN.exec(footerText);
    return match ? match[1] : null;
  }

  private static stripMarker(footerText: string): string {
    return footerText.replace(this.FOOTNOTE_MARKER_PATTERN, "").trim();
  }
}
