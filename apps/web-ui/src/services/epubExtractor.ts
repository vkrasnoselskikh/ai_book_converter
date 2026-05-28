import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
import path from "path";
import fs from "fs";

export interface EpubMetadata {
  title: string;
  authors: string[];
  language: string;
  isbnNumbers: string[];
  coverPath: string | null;
  coverBuffer: Buffer | null;
  pages: Array<{ id: string; href: string; title: string; content: string }>;
}

export class EpubExtractor {
  // Read and parse an EPUB file
  static extract(filePath: string): EpubMetadata {
    if (!fs.existsSync(filePath)) {
      throw new Error(`EPUB file not found: ${filePath}`);
    }

    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    // 1. Find container.xml to locate the OPF file
    const containerEntry = zipEntries.find((entry) => entry.entryName === "META-INF/container.xml");
    if (!containerEntry) {
      throw new Error("Invalid EPUB: META-INF/container.xml missing");
    }

    const parser = new XMLParser({ ignoreAttributes: false });
    const containerXml = containerEntry.getData().toString("utf-8");
    const containerObj = parser.parse(containerXml);
    
    // Get OPF path
    const rootfile = containerObj?.container?.rootfiles?.rootfile;
    const opfPath = rootfile ? rootfile["@_full-path"] : null;
    if (!opfPath) {
      throw new Error("Invalid EPUB: Root OPF file path not declared in container.xml");
    }

    // 2. Load OPF entry
    const opfEntry = zipEntries.find((entry) => entry.entryName === opfPath);
    if (!opfEntry) {
      throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
    }

    const opfXml = opfEntry.getData().toString("utf-8");
    const opfObj = parser.parse(opfXml);

    const metadataNode = opfObj?.package?.metadata;
    const manifestNode = opfObj?.package?.manifest;
    const spineNode = opfObj?.package?.spine;

    if (!metadataNode || !manifestNode || !spineNode) {
      throw new Error("Invalid EPUB OPF format: metadata, manifest, or spine is missing");
    }

    // Resolve OPF base directory (needed to load referenced files)
    const opfDir = path.dirname(opfPath) === "." ? "" : path.dirname(opfPath) + "/";

    // 3. Parse Metadata
    // Title
    let title = "Untitled";
    const rawTitle = metadataNode["dc:title"];
    if (typeof rawTitle === "string") {
      title = rawTitle;
    } else if (rawTitle && rawTitle["#text"]) {
      title = rawTitle["#text"];
    } else if (Array.isArray(rawTitle) && rawTitle.length > 0) {
      title = typeof rawTitle[0] === "string" ? rawTitle[0] : (rawTitle[0]["#text"] || "Untitled");
    }

    // Authors
    const authors: string[] = [];
    const rawCreator = metadataNode["dc:creator"];
    if (typeof rawCreator === "string") {
      authors.push(rawCreator);
    } else if (rawCreator && rawCreator["#text"]) {
      authors.push(rawCreator["#text"]);
    } else if (Array.isArray(rawCreator)) {
      for (const c of rawCreator) {
        if (typeof c === "string") authors.push(c);
        else if (c && c["#text"]) authors.push(c["#text"]);
      }
    } else if (rawCreator && typeof rawCreator === "object") {
      const creatorText = (rawCreator as any)["#text"];
      if (creatorText) authors.push(creatorText);
    }
    if (authors.length === 0) authors.push("Unknown");

    // Language
    let language = "en";
    const rawLang = metadataNode["dc:language"];
    if (typeof rawLang === "string") {
      language = rawLang;
    } else if (rawLang && rawLang["#text"]) {
      language = rawLang["#text"];
    }

    // ISBN numbers
    const isbnNumbers: string[] = [];
    const rawIdentifier = metadataNode["dc:identifier"];
    const parseIdentifiers = (ids: any) => {
      if (typeof ids === "string") {
        if (ids.toLowerCase().includes("isbn")) isbnNumbers.push(ids);
      } else if (ids && ids["#text"]) {
        const text = ids["#text"];
        const scheme = ids["@_opf:scheme"];
        if ((scheme && scheme.toLowerCase() === "isbn") || text.toLowerCase().includes("isbn")) {
          isbnNumbers.push(text);
        }
      }
    };
    if (Array.isArray(rawIdentifier)) {
      rawIdentifier.forEach(parseIdentifiers);
    } else if (rawIdentifier) {
      parseIdentifiers(rawIdentifier);
    }

    // 4. Map Manifest items
    const manifestItems: Record<string, { href: string; mediaType: string; entryName: string }> = {};
    const itemsList = Array.isArray(manifestNode.item) ? manifestNode.item : [manifestNode.item];
    
    for (const item of itemsList) {
      if (item && item["@_id"] && item["@_href"]) {
        const itemId = item["@_id"];
        const href = item["@_href"];
        const mediaType = item["@_media-type"] || "";
        // Clean paths: resolve relative referencing if needed
        const resolvedHref = path.normalize(opfDir + href).replace(/\\/g, "/");
        manifestItems[itemId] = {
          href,
          mediaType,
          entryName: resolvedHref,
        };
      }
    }

    // 5. Detect and Extract Cover Image
    let coverBuffer: Buffer | null = null;
    let coverPath: string | null = null;
    
    // Look for cover item in metadata
    let coverItemId: string | null = null;
    const metaList = Array.isArray(metadataNode.meta) ? metadataNode.meta : [metadataNode.meta];
    for (const meta of metaList) {
      if (meta && meta["@_name"] === "cover" && meta["@_content"]) {
        coverItemId = meta["@_content"];
        break;
      }
    }

    // If not found in metadata, check item properties in manifest
    if (!coverItemId) {
      for (const item of itemsList) {
        if (item && item["@_properties"] === "cover-image") {
          coverItemId = item["@_id"];
          break;
        }
      }
    }

    // Fallback: check items containing "cover" in ID or path
    if (!coverItemId) {
      for (const item of itemsList) {
        if (item && item["@_id"] && item["@_id"].toLowerCase().includes("cover") && item["@_media-type"]?.startsWith("image/")) {
          coverItemId = item["@_id"];
          break;
        }
      }
    }

    if (coverItemId && manifestItems[coverItemId]) {
      const coverItem = manifestItems[coverItemId];
      const entry = zipEntries.find((e) => e.entryName === coverItem.entryName);
      if (entry) {
        coverBuffer = entry.getData();
        coverPath = path.basename(coverItem.entryName);
      }
    }

    // 6. Assemble preview pages in spine order
    const spineItems = Array.isArray(spineNode.itemref) ? spineNode.itemref : [spineNode.itemref];
    const pages: Array<{ id: string; href: string; title: string; content: string }> = [];

    for (const itemref of spineItems) {
      if (itemref && itemref["@_idref"]) {
        const idref = itemref["@_idref"];
        const item = manifestItems[idref];
        if (item && item.mediaType.includes("xml") || item.mediaType.includes("html")) {
          const entry = zipEntries.find((e) => e.entryName === item.entryName);
          if (entry) {
            const rawContent = entry.getData().toString("utf-8");
            
            // Clean/extract body content from XHTML
            let bodyContent = rawContent;
            const bodyMatch = rawContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) {
              bodyContent = bodyMatch[1];
            }

            pages.push({
              id: idref,
              href: item.href,
              title: idref,
              content: bodyContent,
            });
          }
        }
      }
    }

    return {
      title,
      authors,
      language,
      isbnNumbers,
      coverPath,
      coverBuffer,
      pages,
    };
  }
}
