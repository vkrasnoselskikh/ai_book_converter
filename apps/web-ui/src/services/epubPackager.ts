import AdmZip from "adm-zip";
import path from "path";
import { EpubMarkdownRenderService } from "./epubMarkdownRenderService.js";
import { PreviewRenderService } from "./previewRenderService.js";

export class EpubPackager {
  /**
   * Generates a fully compliant, well-formed EPUB e-book archive from book preview artifacts.
   */
  static async createEpub(
    bookId: string,
    metadata: {
      title: string;
      authors: string[];
      language: string;
      isbnNumbers: string[];
      coverSubtitle?: string | null;
      toc?: { entries: any[] };
    },
    pages: any[],
    imagesList: Array<{ fileName: string; buffer: Buffer }>,
    coverBuffer: Buffer | null
  ): Promise<Buffer> {
    const zip = new AdmZip();

    // 1. mimetype (MUST be first entry and stored uncompressed)
    // Mode STORE (compression level 0) is specified as a buffer to avoid deflate
    zip.addFile("mimetype", Buffer.from("application/epub+zip"), "", 0);

    // 2. META-INF/container.xml
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
    zip.addFile("META-INF/container.xml", Buffer.from(containerXml, "utf-8"));

    // 3. OEBPS/css/stylesheet.css (Clean typography layout optimized for modern e-readers)
    const stylesheetCss = `body {
  margin: 5%;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  line-height: 1.5;
  color: #111111;
}
h1 {
  font-size: 1.8em;
  text-align: center;
  margin-top: 10%;
  margin-bottom: 5%;
}
h2 {
  font-size: 1.4em;
  text-align: center;
  margin-top: 8%;
  margin-bottom: 4%;
}
h3 {
  font-size: 1.1em;
  margin-top: 6%;
}
p {
  text-indent: 1.5em;
  margin-top: 0;
  margin-bottom: 0.6em;
  text-align: justify;
}
.cover-container {
  text-align: center;
  padding: 5% 0;
}
.cover-image {
  max-width: 100%;
  max-height: 80vh;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.5em auto;
}
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.5em 0;
  font-size: 0.9em;
}
th, td {
  border: 1px solid #dddddd;
  padding: 0.6em;
  text-align: left;
}
th {
  background-color: #f5f5f5;
  font-weight: bold;
}
ul, ol {
  margin-top: 0;
  margin-bottom: 1em;
  padding-left: 2em;
}
li {
  margin-bottom: 0.4em;
}
pre {
  border: 1px solid #cccccc;
  margin: 3rem 0;
  padding: 1rem;
  overflow: auto;
  white-space: pre;
  word-wrap: normal;
  overflow-wrap: normal;
  font-size: 0.85em;
}
pre code {
  white-space: pre;
  word-wrap: normal;
  overflow-wrap: normal;
  font-size: inherit;
}
`;
    zip.addFile("OEBPS/css/stylesheet.css", Buffer.from(stylesheetCss, "utf-8"));

    // 4. Populate manifest elements
    const spineRefList: string[] = [];
    const manifestItems: string[] = [];

    // Add stylesheet
    manifestItems.push(`<item id="stylesheet" href="css/stylesheet.css" media-type="text/css"/>`);

    // Add extracted images to zip and OPF manifest
    imagesList.forEach((img, idx) => {
      zip.addFile(`OEBPS/images/${img.fileName}`, img.buffer);
      const ext = path.extname(img.fileName).substring(1).toLowerCase();
      const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      manifestItems.push(`<item id="img-${idx}" href="images/${img.fileName}" media-type="${mime}"/>`);
    });

    // Add cover image and create dedicated cover.xhtml page
    if (coverBuffer) {
      zip.addFile("OEBPS/images/cover.png", coverBuffer);
      manifestItems.push(`<item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>`);

      const coverHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>Cover</title>
  <link rel="stylesheet" type="text/css" href="../css/stylesheet.css" />
</head>
<body>
  <div class="cover-container">
    <img src="images/cover.png" alt="Cover" class="cover-image" />
    ${metadata.coverSubtitle ? `<h2>${metadata.coverSubtitle}</h2>` : ""}
  </div>
</body>
</html>`;
      zip.addFile("OEBPS/xhtml/cover.xhtml", Buffer.from(coverHtml, "utf-8"));
      manifestItems.push(`<item id="cover-page" href="xhtml/cover.xhtml" media-type="application/xhtml+xml"/>`);
      spineRefList.push("cover-page");
    }

    // Process and append body content pages
    for (const [idx, page] of pages.entries()) {
      const pageId = `page-${idx}`;
      const pageFileName = `page-${idx}.xhtml`;

      let bodyContent = "";
      if (typeof page.content === "string") {
        // Existing HTML (EPUB import)
        bodyContent = page.content;
      } else if (typeof page.markdown === "string") {
        // Markdown (DJVU/PDF OCR source)
        let pageMarkdown = PreviewRenderService.replaceTablePlaceholders(page.markdown, page.tables || []);
        pageMarkdown = PreviewRenderService.replaceImagePlaceholders(pageMarkdown, page.images || [], "../images");
        bodyContent = await EpubMarkdownRenderService.renderMarkdownBody(pageMarkdown);
      } else {
        bodyContent = `<p>No content on this page.</p>`;
      }

      const pageXml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${page.title || `Page ${idx + 1}`}</title>
  <link rel="stylesheet" type="text/css" href="../css/stylesheet.css" />
</head>
<body>
  ${bodyContent}
</body>
</html>`;

      zip.addFile(`OEBPS/xhtml/${pageFileName}`, Buffer.from(pageXml, "utf-8"));
      manifestItems.push(`<item id="${pageId}" href="xhtml/${pageFileName}" media-type="application/xhtml+xml"/>`);
      spineRefList.push(pageId);
    }

    // 5. Generate content.opf
    const authorsXml = metadata.authors.map(a => `<dc:creator>${a}</dc:creator>`).join("\n");
    const isbnXml = metadata.isbnNumbers.map(i => `<dc:identifier id="pub-id-${i}">${i}</dc:identifier>`).join("\n");
    const primaryId = metadata.isbnNumbers[0] ? `pub-id-${metadata.isbnNumbers[0]}` : "pub-id-default";

    const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" unique-identifier="${primaryId}" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>${metadata.title}</dc:title>
    ${authorsXml}
    <dc:language>${metadata.language}</dc:language>
    ${metadata.isbnNumbers.length > 0 ? isbnXml : '<dc:identifier id="pub-id-default">urn:uuid:' + bookId + '</dc:identifier>'}
    ${coverBuffer ? '<meta name="cover" content="cover-image"/>' : ""}
  </metadata>
  <manifest>
    ${manifestItems.join("\n    ")}
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
  </manifest>
  <spine toc="ncx">
    ${spineRefList.map(ref => `<itemref idref="${ref}"/>`).join("\n    ")}
  </spine>
</package>`;

    zip.addFile("OEBPS/content.opf", Buffer.from(opfXml, "utf-8"));

    // 6. Generate toc.ncx Navigation Table of Contents
    const navPoints: string[] = [];
    const tocEntries = metadata.toc?.entries || [];

    if (tocEntries.length > 0) {
      tocEntries.forEach((entry: any, idx: number) => {
        const pageIdx = this.anchorIdToGeneratedPageIndex(entry.anchorId, idx);
        const targetXhtml = `xhtml/page-${pageIdx}.xhtml`;

        navPoints.push(`    <navPoint id="navpoint-${idx + 1}" playOrder="${idx + 1}">
      <navLabel>
        <text>${entry.title}</text>
      </navLabel>
      <content src="${targetXhtml}"/>
    </navPoint>`);
      });
    } else {
      navPoints.push(`    <navPoint id="navpoint-1" playOrder="1">
      <navLabel>
        <text>Start</text>
      </navLabel>
      <content src="${coverBuffer ? "xhtml/cover.xhtml" : "xhtml/page-0.xhtml"}"/>
    </navPoint>`);
    }

    const ncxXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE ncx PUBLIC "-//NISO//DTD NCX 2005-1//EN" "http://www.daisy.org/z3986/2005/ncx-2005-1.dtd">
<ncx version="2005-1" xmlns="http://www.daisy.org/z3986/2005/ncx/">
  <head>
    <meta name="dtb:uid" content="urn:uuid:${bookId}"/>
    <meta name="dtb:depth" content="1"/>
    <meta name="dtb:totalPageCount" content="0"/>
    <meta name="dtb:maxPageNumber" content="0"/>
  </head>
  <docTitle>
    <text>${metadata.title}</text>
  </docTitle>
  <navMap>
\n${navPoints.join("\n")}\n  </navMap>
</ncx>`;

    zip.addFile("OEBPS/toc.ncx", Buffer.from(ncxXml, "utf-8"));

    return zip.toBuffer();
  }

  private static anchorIdToGeneratedPageIndex(anchorId: string, fallbackIndex: number): number {
    const match = /^page-(\d+)$/.exec(anchorId || "");
    if (!match) {
      return fallbackIndex;
    }
    return Math.max(0, parseInt(match[1], 10) - 1);
  }
}
