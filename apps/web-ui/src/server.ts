import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import fs from "fs";
import multer from "multer";
import type { Server } from "node:http";
import { fileURLToPath, pathToFileURL } from "url";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import { AppDataSource, initializeDatabase } from "./database/dataSource.js";
import { BookRepository } from "./database/repositories/BookRepository.js";
import { Book } from "./database/entities/Book.js";
import { AuthService } from "./services/authService.js";
import { AccountLinkingService } from "./services/accountLinkingService.js";
import { BookStorageService } from "./services/bookStorageService.js";
import { BookProcessingService } from "./services/bookProcessingService.js";
import { EpubPackager } from "./services/epubPackager.js";
import { PreviewRenderService } from "./services/previewRenderService.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger("server");

const app = express();
const upload = multer({
  dest: fileURLToPath(new URL("../uploads", import.meta.url)),
});

app.use(express.json());
app.use(cookieParser());
app.use(cors());

// Initialize Database before starting server
await initializeDatabase();

const bookRepo = new BookRepository();
const authService = new AuthService();
const accountLinkingService = new AccountLinkingService();
const storageService = new BookStorageService();
const processingService = new BookProcessingService();

// Session Middleware to resolve anonymous or authenticated context
app.use(async (req: any, res: any, next) => {
  const sessionId = req.cookies.session_id;
  const authToken = req.cookies.auth_token;

  req.session = { sessionId: null, userId: null, displayName: null };

  if (authToken) {
    const verified = authService.verifyToken(authToken);
    if (verified) {
      req.session.userId = verified.userId;
      req.session.displayName = verified.displayName;
    }
  }

  // Always maintain an active anonymous session
  const anonymousSession = await authService.resolveAnonymousSession(sessionId);
  req.session.sessionId = anonymousSession.id;
  res.cookie("session_id", anonymousSession.id, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
  });

  next();
});

// Helper: check access control to book
const verifyBookAccess = async (
  bookId: string,
  session: any,
): Promise<boolean> => {
  if (session.userId) {
    const book = await bookRepo.findByIdAndUser(bookId, session.userId);
    if (book) return true;
  }
  const book = await bookRepo.findByIdAndSession(bookId, session.sessionId);
  return !!book;
};

/* --- REST APIs --- */

// 1. Session state endpoint
app.get("/api/session", async (req: any, res) => {
  try {
    let booksList: any[] = [];
    if (req.session.userId) {
      booksList = await bookRepo.findAllByUser(req.session.userId);
    } else {
      booksList = await bookRepo.findAllBySession(req.session.sessionId);
    }

    res.json({
      session: {
        sessionId: req.session.sessionId,
        userId: req.session.userId,
        displayName: req.session.displayName,
      },
      booksList: booksList.map((b) => ({
        id: b.id,
        originalFileName: b.originalFileName,
        status: b.status,
      })),
    });
  } catch {
    res.status(500).json({ error: "Failed to load session details" });
  }
});

// 2. Mock authentication endpoint
app.get("/api/auth/:provider/callback", async (req: any, res) => {
  const { provider } = req.params;
  const name = (req.query.name as string) || "Mock User";
  const subject = (req.query.subject as string) || `${provider}-subject-123`;

  if (
    provider !== "google" &&
    provider !== "facebook" &&
    provider !== "telegram"
  ) {
    res.status(400).json({ error: "Unsupported provider" });
    return;
  }

  try {
    const { user, token } = await authService.handleMockAuth(
      provider,
      subject,
      name,
    );

    // Perform account linking (merge books from anonymous session)
    await accountLinkingService.linkSessionToUser(
      req.session.sessionId,
      user.id,
    );

    // Set cookie
    res.cookie("auth_token", token, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    });

    res.json({
      success: true,
      user: { id: user.id, displayName: user.displayName },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Mock Logout endpoint
app.post("/api/auth/logout", (_req: any, res) => {
  res.clearCookie("auth_token");
  res.json({ success: true });
});

// 4. Book Upload endpoint
app.post("/api/books", upload.single("book"), async (req: any, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file was uploaded" });
    return;
  }

  const { originalname, path: tempPath } = req.file;
  const suffix = originalname
    .substring(originalname.lastIndexOf("."))
    .toLowerCase();

  if (suffix !== ".epub" && suffix !== ".djvu" && suffix !== ".pdf") {
    fs.unlinkSync(tempPath);
    res.status(400).json({
      error: "Unsupported file format. Only EPUB, DJVU, and PDF are allowed.",
    });
    return;
  }

  try {
    let sourceFormat: "epub" | "djvu" | "pdf";
    if (suffix === ".epub") {
      sourceFormat = "epub";
    } else if (suffix === ".djvu") {
      sourceFormat = "djvu";
    } else {
      sourceFormat = "pdf";
    }

    // Create Book DB Record
    const book = await bookRepo.create(originalname, sourceFormat, "");

    // Secure books directories
    const targetFileName = `original${suffix}`;
    const destinationPath = storageService.moveFile(
      book.id,
      "source",
      targetFileName,
      tempPath,
    );

    // Save actual storage path
    book.storagePath = destinationPath;
    await bookRepo.updateStatus(book.id, "uploaded");

    // Access Link creation
    if (req.session.userId) {
      await bookRepo.linkToUser(book.id, req.session.userId, "owner");
    } else {
      await bookRepo.linkToSession(book.id, req.session.sessionId, "owner");
    }

    // Trigger background process execution
    processingService.processBookInBackground(book.id, destinationPath);

    res.status(201).json({
      success: true,
      bookId: book.id,
      bookUrl: `/books/${book.id}`,
      book,
    });
  } catch (err: any) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    res.status(500).json({ error: "Failed to store book: " + err.message });
  }
});

// 5. Get Book details
app.get("/api/books/:bookId", async (req: any, res) => {
  const { bookId } = req.params;

  try {
    const hasAccess = await verifyBookAccess(bookId, req.session);
    if (!hasAccess) {
      res.status(403).json({
        error: "Access Denied: You do not have ownership of this book.",
      });
      return;
    }

    const book = await bookRepo.findById(bookId);
    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    res.json({ book });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update Metadata
app.patch("/api/books/:bookId/metadata", async (req: any, res) => {
  const { bookId } = req.params;
  const patchData = req.body;

  try {
    const hasAccess = await verifyBookAccess(bookId, req.session);
    if (!hasAccess) {
      res.status(403).json({ error: "Access Denied" });
      return;
    }

    await bookRepo.saveMetadata(bookId, patchData);
    const book = await bookRepo.findById(bookId);

    res.json({ success: true, book });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Replace Cover Image
app.put(
  "/api/books/:bookId/cover",
  upload.single("cover"),
  async (req: any, res) => {
    const { bookId } = req.params;
    if (!req.file) {
      res.status(400).json({ error: "No cover file uploaded" });
      return;
    }

    try {
      const hasAccess = await verifyBookAccess(bookId, req.session);
      if (!hasAccess) {
        fs.unlinkSync(req.file.path);
        res.status(403).json({ error: "Access Denied" });
        return;
      }

      const coverFileName = "cover.png";
      const coverBuffer = fs.readFileSync(req.file.path);
      storageService.writeFile(bookId, "cover", coverFileName, coverBuffer);
      fs.unlinkSync(req.file.path);

      // Save coverPath reference
      await bookRepo.saveMetadata(bookId, {
        coverPath: `cover/${coverFileName}`,
      });

      res.json({ success: true });
    } catch (err: any) {
      if (req.file && fs.existsSync(req.file.path))
        fs.unlinkSync(req.file.path);
      res.status(500).json({ error: err.message });
    }
  },
);

// 8. Get preview representation
app.get("/api/books/:bookId/preview", async (req: any, res) => {
  const { bookId } = req.params;

  try {
    const hasAccess = await verifyBookAccess(bookId, req.session);
    if (!hasAccess) {
      res.status(403).json({ error: "Access Denied" });
      return;
    }

    const contentHtml = storageService
      .readFile(bookId, "preview", "content.html")
      .toString("utf-8");

    let markdownPages: ReturnType<typeof PreviewRenderService.renderMarkdownPages> = [];
    let markdownContent = "";
    let endnotes = [];

    try {
      const pages = JSON.parse(
        storageService
          .readFile(bookId, "preview", "pages.json")
          .toString("utf-8"),
      );

      if (
        Array.isArray(pages) &&
        pages.some((page) => typeof page.markdown === "string")
      ) {
        let hasMarkdownPreviewArtifacts = false;

        try {
          endnotes = JSON.parse(
            storageService
              .readFile(bookId, "preview", "endnotes.json")
              .toString("utf-8"),
          );
          hasMarkdownPreviewArtifacts = true;
        } catch {
          endnotes = [];
        }

        try {
          markdownContent = storageService
            .readFile(bookId, "preview", "content.md")
            .toString("utf-8");
          hasMarkdownPreviewArtifacts = true;
        } catch {
          markdownContent = "";
        }

        if (hasMarkdownPreviewArtifacts) {
          markdownPages = PreviewRenderService.renderMarkdownPages(
            pages,
            `/api/books/${bookId}/files/images`,
          );
          if (!markdownContent) {
            markdownContent = PreviewRenderService.renderBookMarkdown(
              markdownPages,
              endnotes,
            );
          }
        }
      }
    } catch {
      markdownPages = [];
    }

    res.json({ htmlContent: contentHtml, markdownContent, markdownPages, endnotes });
  } catch {
    res.status(500).json({ error: "Failed to read preview content" });
  }
});

// 9. Serving safe files with path traversal protections
app.get(
  "/api/books/:bookId/files/:subFolder/:fileName",
  async (req: any, res) => {
    const { bookId, subFolder, fileName } = req.params;

    // UUID Check
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(bookId)) {
      res.status(400).json({ error: "Invalid Book ID format" });
      return;
    }

    // Path traversal check
    if (
      subFolder.includes("..") ||
      fileName.includes("..") ||
      fileName.includes("/") ||
      fileName.includes("\\")
    ) {
      res.status(403).json({ error: "Path traversal restriction violated" });
      return;
    }

    if (subFolder !== "cover" && subFolder !== "images") {
      res.status(403).json({ error: "Access to subfolder restricted" });
      return;
    }

    try {
      const hasAccess = await verifyBookAccess(bookId, req.session);
      if (!hasAccess) {
        res.status(403).json({ error: "Access Denied" });
        return;
      }

      const fileBuffer = storageService.readFile(bookId, subFolder, fileName);

      // Set appropriate headers
      if (fileName.endsWith(".png")) res.setHeader("Content-Type", "image/png");
      else if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg"))
        res.setHeader("Content-Type", "image/jpeg");
      else if (fileName.endsWith(".webp"))
        res.setHeader("Content-Type", "image/webp");
      else if (fileName.endsWith(".gif"))
        res.setHeader("Content-Type", "image/gif");
      else res.setHeader("Content-Type", "application/octet-stream");

      res.send(fileBuffer);
    } catch {
      res.status(404).json({ error: "File not found" });
    }
  },
);

// 10. Compile and Download EPUB
app.get("/api/books/:bookId/download", async (req: any, res) => {
  const { bookId } = req.params;

  try {
    const hasAccess = await verifyBookAccess(bookId, req.session);
    if (!hasAccess) {
      res.status(403).json({ error: "Access Denied" });
      return;
    }

    const book = await bookRepo.findById(bookId);
    if (!book) {
      res.status(404).json({ error: "Book not found" });
      return;
    }

    // Load pages.json
    let pages: any[] = [];
    try {
      const pagesBuffer = storageService.readFile(
        bookId,
        "preview",
        "pages.json",
      );
      pages = JSON.parse(pagesBuffer.toString("utf-8"));
    } catch {
      pages = [];
    }

    // Load images
    const imagesList: Array<{ fileName: string; buffer: Buffer }> = [];
    const bookDir = storageService.getBookDir(bookId);
    const imagesDir = path.join(bookDir, "images");
    if (fs.existsSync(imagesDir)) {
      const files = fs.readdirSync(imagesDir);
      for (const file of files) {
        if (file.startsWith(".")) continue;
        try {
          const imgBuffer = fs.readFileSync(path.join(imagesDir, file));
          imagesList.push({ fileName: file, buffer: imgBuffer });
        } catch {
          // ignore error
        }
      }
    }

    // Load cover if available
    let coverBuffer: Buffer | null = null;
    if (book.metadata?.coverPath) {
      try {
        const coverFileName = path.basename(book.metadata.coverPath);
        coverBuffer = storageService.readFile(bookId, "cover", coverFileName);
      } catch {
        // ignore
      }
    }

    // Prepare packager metadata format
    const packagerMetadata = {
      title: book.metadata?.title || book.originalFileName,
      authors: book.metadata?.authors || ["Unknown"],
      language: book.metadata?.language || "en",
      isbnNumbers: book.metadata?.isbnNumbers || [],
      coverSubtitle: book.metadata?.coverSubtitle,
      toc: book.metadata?.toc,
    };

    const epubBuffer = EpubPackager.createEpub(
      bookId,
      packagerMetadata,
      pages,
      imagesList,
      coverBuffer,
    );

    const safeTitle = (book.metadata?.title || book.originalFileName).replace(
      /[^a-zA-Z0-9А-Яа-я]/g,
      "_",
    );

    res.setHeader("Content-Type", "application/epub+zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(safeTitle)}.epub"`,
    );
    res.send(epubBuffer);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate EPUB: " + err.message });
  }
});

/* --- SSR & CLIENT ASSETS --- */

const port = process.env.PORT || 8000;

// Setup HMR dev server or Production serve
let vite: ViteDevServer | null = null;
if (process.env.NODE_ENV !== "production") {
  vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "custom",
  });
  app.use(vite.middlewares);
} else {
  app.use(
    express.static(fileURLToPath(new URL("../dist/public", import.meta.url))),
  );
}

app.get("*", async (req: any, res) => {
  const url = req.originalUrl;

  try {
    let template = "";
    let renderFn: any;

    if (process.env.NODE_ENV !== "production") {
      if (!vite) {
        throw new Error("Vite development server is not initialized");
      }
      template = fs.readFileSync(
        fileURLToPath(new URL("../index.html", import.meta.url)),
        "utf-8",
      );
      template = await vite.transformIndexHtml(url, template);
      const mod = await vite.ssrLoadModule("/src/ssr/renderApp.tsx");
      renderFn = mod.render;
    } else {
      template = fs.readFileSync(
        fileURLToPath(new URL("../dist/public/index.html", import.meta.url)),
        "utf-8",
      );
      // Load precompiled renderApp
      const mod = await import(
        pathToFileURL(
          fileURLToPath(new URL("../dist/ssr/renderApp.js", import.meta.url)),
        ).href
      );
      renderFn = mod.render;
    }

    // Initialize state
    let currentBook: Book | null = null;
    const match = url.match(/\/books\/([a-fA-F0-9-]+)/);
    if (match) {
      const bookId = match[1];
      const hasAccess = await verifyBookAccess(bookId, req.session);
      if (hasAccess) {
        currentBook = await bookRepo.findById(bookId);
      }
    }

    let booksList: any[] = [];
    if (req.session.userId) {
      booksList = await bookRepo.findAllByUser(req.session.userId);
    } else {
      booksList = await bookRepo.findAllBySession(req.session.sessionId);
    }

    const initialState = {
      session: {
        sessionId: req.session.sessionId,
        userId: req.session.userId,
        displayName: req.session.displayName,
      },
      currentBook,
      booksList: booksList.map((b) => ({
        id: b.id,
        originalFileName: b.originalFileName,
        status: b.status,
      })),
    };

    // Render React App to Markup
    const appHtml = renderFn(url, initialState);

    // Inject appHtml and initialState
    let html = template.replace(
      `<div id="root"></div>`,
      `<div id="root">${appHtml}</div>`,
    );
    html = html.replace(
      `</head>`,
      `<script>window.__INITIAL_STATE__ = ${JSON.stringify(initialState)};</script></head>`,
    );

    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (err: any) {
    logger.error("SSR Rendering crashed:", err);
    res.status(500).end("Server side rendering error: " + err.message);
  }
});

const httpServer: Server = app.listen(port, () => {
  logger.info(
    `Server is running at http://localhost:${port} in ${process.env.NODE_ENV || "development"} mode`,
  );
});

let isShuttingDown = false;

const closeHttpServer = async (): Promise<void> => {
  httpServer.closeIdleConnections?.();
  await new Promise((resolve, reject) => {
    httpServer.close((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(undefined);
    });
  });
};

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info(`Received ${signal}; shutting down server...`);

  const forceExitTimer = setTimeout(() => {
    logger.error("Graceful shutdown timed out; forcing process exit");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    await closeHttpServer();
    if (vite) {
      await vite.close();
    }
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    logger.info("Server stopped");
    process.exit(0);
  } catch (err) {
    logger.error("Server shutdown failed:", err);
    process.exit(1);
  }
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
