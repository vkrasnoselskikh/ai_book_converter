import React, { useState, useEffect } from "react";
import { AppShell } from "./AppShell.js";
import { BookUploadPanel } from "./BookUploadPanel.js";
import { BookReader } from "./BookReader.js";

interface Book {
  id: string;
  originalFileName: string;
  sourceFormat: "epub" | "djvu" | "pdf";
  status: "uploaded" | "processing" | "ready" | "failed";
  statusMessage?: string | null;
  metadata?: {
    title: string;
    authors: string[];
    isbnNumbers: string[];
    language: string;
    coverSubtitle: string | null;
    coverPath: string | null;
    toc?: { entries: any[] };
  } | null;
}

interface PreviewMarkdownPage {
  pageIndex: number;
  pageNumber?: number;
  anchorId: string;
  markdown: string;
}

interface PreviewEndnote {
  noteId: string;
  refId: string;
  marker: string | null;
  text: string;
  linked: boolean;
}

interface InitialState {
  session: {
    sessionId: string;
    userId: string | null;
    displayName: string | null;
  };
  currentBook: Book | null;
  booksList: Array<{ id: string; originalFileName: string; status: string }>;
}

declare global {
  interface Window {
    __INITIAL_STATE__?: InitialState;
  }
}

export const App: React.FC<{ initialState?: InitialState }> = ({
  initialState,
}) => {
  // Load initial state from SSR injection or fallbacks
  const [session, setSession] = useState<InitialState["session"]>(() => {
    if (initialState) return initialState.session;
    if (typeof window !== "undefined" && window.__INITIAL_STATE__) {
      return window.__INITIAL_STATE__.session;
    }
    return { sessionId: "", userId: null, displayName: null };
  });

  const [currentBook, setCurrentBook] = useState<Book | null>(() => {
    if (initialState) return initialState.currentBook;
    if (typeof window !== "undefined" && window.__INITIAL_STATE__) {
      return window.__INITIAL_STATE__.currentBook;
    }
    return null;
  });

  const [booksList, setBooksList] = useState<InitialState["booksList"]>(() => {
    if (initialState) return initialState.booksList;
    if (typeof window !== "undefined" && window.__INITIAL_STATE__) {
      return window.__INITIAL_STATE__.booksList;
    }
    return [];
  });

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [markdownPages, setMarkdownPages] = useState<PreviewMarkdownPage[]>([]);
  const [endnotes, setEndnotes] = useState<PreviewEndnote[]>([]);
  const [activeTab, setActiveTab] = useState<"reader" | "metadata">("reader");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Metadata edit fields
  const [editTitle, setEditTitle] = useState("");
  const [editAuthors, setEditAuthors] = useState("");
  const [editIsbn, setEditIsbn] = useState("");
  const [editLang, setEditLang] = useState("");
  const [editSubtitle, setEditSubtitle] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isReplacingCover, setIsReplacingCover] = useState(false);

  // Sync edits when active book changes
  useEffect(() => {
    if (currentBook?.metadata) {
      setEditTitle(currentBook.metadata.title || "");
      setEditAuthors((currentBook.metadata.authors || []).join(", "));
      setEditIsbn((currentBook.metadata.isbnNumbers || []).join(", "));
      setEditLang(currentBook.metadata.language || "en");
      setEditSubtitle(currentBook.metadata.coverSubtitle || "");
    }
  }, [currentBook]);

  // Load preview content once book is ready
  useEffect(() => {
    if (currentBook?.status === "ready") {
      fetch(`/api/books/${currentBook.id}/preview`)
        .then((res) => res.json())
        .then((data) => {
          setHtmlContent(data.htmlContent || "");
          setMarkdownPages(
            Array.isArray(data.markdownPages) ? data.markdownPages : [],
          );
          setEndnotes(Array.isArray(data.endnotes) ? data.endnotes : []);
        })
        .catch((err) => console.error("Failed to load preview:", err));
    } else {
      setHtmlContent("");
      setMarkdownPages([]);
      setEndnotes([]);
    }
  }, [currentBook?.id, currentBook?.status]);

  // Polling for processing status
  useEffect(() => {
    if (!currentBook) return;
    let interval: any;
    if (
      currentBook.status === "uploaded" ||
      currentBook.status === "processing"
    ) {
      interval = setInterval(() => {
        fetch(`/api/books/${currentBook.id}`)
          .then((res) => res.json())
          .then((data) => {
            if (data.book) {
              setCurrentBook(data.book);
              // Refresh books list to show new states in dropdown
              fetchSessionContext();
            }
          })
          .catch((err) => console.error("Polling error:", err));
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentBook?.id, currentBook?.status]);

  // Handle URL history state (popstate back/forward triggers)
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/\/books\/([a-fA-F0-9-]+)/);
      if (match) {
        const bookId = match[1];
        fetchBookDetails(bookId);
      } else {
        setCurrentBook(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const fetchSessionContext = () => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.session) setSession(data.session);
        if (data.booksList) setBooksList(data.booksList);
      })
      .catch((err) => console.error("Session refresh failed:", err));
  };

  const fetchBookDetails = (bookId: string) => {
    fetch(`/api/books/${bookId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.book) setCurrentBook(data.book);
      })
      .catch((err) => console.error("Failed to fetch book details:", err));
  };

  // Upload book pipeline
  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    const formData = new FormData();
    formData.append("book", file);

    try {
      const response = await fetch("/api/books", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      // Immediately transition URL to processing book endpoint
      window.history.pushState(null, "", `/books/${data.bookId}`);
      setCurrentBook(data.book);
      fetchSessionContext();
    } catch (err: any) {
      setUploadError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  // Trigger select active book
  const handleSelectBook = (bookId: string) => {
    window.history.pushState(null, "", `/books/${bookId}`);
    fetchBookDetails(bookId);
  };

  // Back to Dashboard
  const handleBackToHome = () => {
    window.history.pushState(null, "", "/");
    setCurrentBook(null);
  };

  // Save book metadata patches
  const handleSaveMetadata = async () => {
    if (!currentBook) return;
    setIsSavingMetadata(true);

    try {
      const response = await fetch(`/api/books/${currentBook.id}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          authors: editAuthors
            .split(",")
            .map((a) => a.trim())
            .filter(Boolean),
          isbnNumbers: editIsbn
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean),
          language: editLang,
          coverSubtitle: editSubtitle,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Save metadata failed");

      setCurrentBook(data.book);
      fetchSessionContext();
    } catch (err: any) {
      alert("Failed to save: " + err.message);
    } finally {
      setIsSavingMetadata(false);
    }
  };

  // Replace book cover override
  const handleReplaceCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentBook || !e.target.files?.[0]) return;
    setIsReplacingCover(true);

    const formData = new FormData();
    formData.append("cover", e.target.files[0]);

    try {
      const response = await fetch(`/api/books/${currentBook.id}/cover`, {
        method: "PUT",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Replace cover failed");

      // Refresh
      fetchBookDetails(currentBook.id);
    } catch (err: any) {
      alert("Replace cover failed: " + err.message);
    } finally {
      setIsReplacingCover(false);
    }
  };

  // Mock Authentication Logins
  const handleMockLogin = async (
    provider: "google" | "facebook" | "telegram",
  ) => {
    let name = "";
    let sub = "";
    if (provider === "google") {
      name = "Yann LeCun";
      sub = "google-subject-999";
    } else if (provider === "facebook") {
      name = "Andrey Karpathy";
      sub = "facebook-subject-888";
    } else {
      name = "Demis Hassabis";
      sub = "telegram-subject-777";
    }

    try {
      const response = await fetch(
        `/api/auth/${provider}/callback?name=${encodeURIComponent(name)}&subject=${sub}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Mock auth failed");

      setIsAuthModalOpen(false);
      fetchSessionContext();
      if (currentBook) fetchBookDetails(currentBook.id);
    } catch (err: any) {
      alert("Auth failed: " + err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setSession({ sessionId: "", userId: null, displayName: null });
      setBooksList([]);
      setCurrentBook(null);
      window.history.pushState(null, "", "/");
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  return (
    <AppShell
      displayName={session.displayName}
      currentBookTitle={
        currentBook?.metadata?.title || currentBook?.originalFileName
      }
      currentBookStatus={currentBook?.status}
      onLogout={handleLogout}
      onLoginClick={() => setIsAuthModalOpen(true)}
      onBackToHome={handleBackToHome}
      booksList={booksList}
      onSelectBook={handleSelectBook}
    >
      {!currentBook ? (
        // 1. Dashboard empty state with upload panel
        <div className="flex-1 flex flex-col justify-center items-center py-16 px-4">
          <div className="max-w-xl text-center mb-8">
            <h2 className="font-heading font-extrabold text-4xl sm:text-5xl tracking-tight mb-4">
              AI Book Converter
            </h2>
            <p className="text-base-content/75 text-lg">
              Upload scanned PDF or DJVU files to extract text, tables, and
              images via AI. Download a ready EPUB with proper e-book markup.
            </p>
          </div>
          <BookUploadPanel
            onUpload={handleUpload}
            isUploading={isUploading}
            error={uploadError}
          />
        </div>
      ) : (
        // 2. Interactive Workspace
        <div className="flex-1 flex flex-col">
          {/* Status states handling */}
          {currentBook.status === "uploaded" ||
          currentBook.status === "processing" ? (
            <div className="flex-1 flex flex-col justify-center items-center py-16 px-4">
              <div className="max-w-md text-center flex flex-col items-center gap-6">
                <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-heading font-extrabold text-2xl">
                    Processing Book...
                  </h3>
                  <p className="text-sm text-base-content/65 leading-relaxed">
                    Converting, extracting text, tables, and images via Mistral
                    AI. This might take a few moments.
                  </p>
                </div>
                <div className="w-full bg-base-300 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-primary h-full w-2/3 rounded-full animate-pulse"></div>
                </div>
              </div>
            </div>
          ) : currentBook.status === "failed" ? (
            <div className="flex-1 flex flex-col justify-center items-center py-16 px-4">
              <div className="max-w-md bg-error/15 border border-error/25 p-8 rounded-3xl text-center shadow-lg">
                <div className="w-16 h-16 rounded-full bg-error/20 text-error flex items-center justify-center mx-auto mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <h3 className="font-heading font-extrabold text-2xl text-error mb-2">
                  Processing Failed
                </h3>
                <p className="text-sm text-base-content/75 leading-relaxed mb-6">
                  {currentBook.statusMessage ||
                    "An unknown error occurred while extracting contents."}
                </p>
                <button
                  onClick={handleBackToHome}
                  className="btn btn-outline btn-sm rounded-xl"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          ) : (
            // Success State - Workspace Tabs
            <div className="flex-1 flex flex-col">
              {/* Tab Header Selector */}
              <div className="bg-base-200/50 border-b border-base-content/10 px-4 sm:px-8 py-2 flex items-center justify-between">
                <div className="tabs tabs-boxed rounded-xl p-1 bg-base-300/40">
                  <button
                    onClick={() => setActiveTab("reader")}
                    className={`tab rounded-lg font-semibold text-xs transition-all ${
                      activeTab === "reader"
                        ? "tab-active bg-primary text-primary-content shadow-sm"
                        : ""
                    }`}
                  >
                    Preview Reader
                  </button>
                  <button
                    onClick={() => setActiveTab("metadata")}
                    className={`tab rounded-lg font-semibold text-xs transition-all ${
                      activeTab === "metadata"
                        ? "tab-active bg-primary text-primary-content shadow-sm"
                        : ""
                    }`}
                  >
                    Edit Metadata & Cover
                  </button>
                </div>
                {/* Download Button */}
                <a
                  href={`/api/books/${currentBook.id}/download`}
                  download={`${currentBook.metadata?.title || currentBook.originalFileName}.epub`}
                  className="btn btn-primary btn-sm rounded-xl gap-2 shadow-sm font-bold text-xs"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download EPUB
                </a>
              </div>

              {/* Viewport render */}
              {activeTab === "reader" ? (
                <BookReader
                  htmlContent={htmlContent}
                  markdownPages={markdownPages}
                  endnotes={endnotes}
                  tocEntries={currentBook.metadata?.toc?.entries || []}
                  title={
                    currentBook.metadata?.title || currentBook.originalFileName
                  }
                  authors={currentBook.metadata?.authors || ["Unknown"]}
                />
              ) : (
                <div className="max-w-4xl mx-auto p-6 sm:p-12 w-full text-left">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Cover Editor Panel */}
                    <div className="card bg-base-200/40 border border-base-content/10 rounded-3xl p-6 flex flex-col items-center text-center shadow-md">
                      <h4 className="font-heading font-bold text-lg mb-4">
                        Book Cover
                      </h4>
                      <div className="w-48 h-64 rounded-2xl bg-base-300 border border-base-content/10 flex items-center justify-center overflow-hidden shadow-md relative group">
                        {currentBook.metadata?.coverPath ? (
                          <img
                            src={`/api/books/${currentBook.id}/files/${currentBook.metadata.coverPath}?t=${Date.now()}`}
                            alt="Cover preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xs text-base-content/40 italic">
                            No cover image
                          </span>
                        )}
                        {isReplacingCover && (
                          <div className="absolute inset-0 bg-base-300/80 flex items-center justify-center">
                            <span className="loading loading-spinner text-primary"></span>
                          </div>
                        )}
                      </div>

                      <label className="btn btn-outline btn-sm rounded-xl mt-6 cursor-pointer">
                        Replace Cover
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleReplaceCover}
                          disabled={isReplacingCover}
                        />
                      </label>
                    </div>

                    {/* Metadata Fields Panel */}
                    <div className="md:col-span-2 card bg-base-200/40 border border-base-content/10 rounded-3xl p-6 sm:p-8 shadow-md">
                      <h4 className="font-heading font-bold text-lg mb-6">
                        Book Metadata
                      </h4>
                      <div className="flex flex-col gap-4">
                        <div className="form-control">
                          <label className="label text-xs uppercase tracking-wider text-base-content/50 font-bold">
                            Book Title
                          </label>
                          <input
                            type="text"
                            className="input input-bordered rounded-xl"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                          />
                        </div>
                        <div className="form-control">
                          <label className="label text-xs uppercase tracking-wider text-base-content/50 font-bold">
                            Authors (comma separated)
                          </label>
                          <input
                            type="text"
                            className="input input-bordered rounded-xl"
                            value={editAuthors}
                            onChange={(e) => setEditAuthors(e.target.value)}
                          />
                        </div>
                        <div className="form-control">
                          <label className="label text-xs uppercase tracking-wider text-base-content/50 font-bold">
                            Cover Subtitle
                          </label>
                          <input
                            type="text"
                            className="input input-bordered rounded-xl"
                            value={editSubtitle}
                            onChange={(e) => setEditSubtitle(e.target.value)}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="form-control">
                            <label className="label text-xs uppercase tracking-wider text-base-content/50 font-bold">
                              ISBN Numbers
                            </label>
                            <input
                              type="text"
                              className="input input-bordered rounded-xl"
                              value={editIsbn}
                              onChange={(e) => setEditIsbn(e.target.value)}
                            />
                          </div>
                          <div className="form-control">
                            <label className="label text-xs uppercase tracking-wider text-base-content/50 font-bold">
                              Language Code
                            </label>
                            <input
                              type="text"
                              className="input input-bordered rounded-xl"
                              value={editLang}
                              onChange={(e) => setEditLang(e.target.value)}
                            />
                          </div>
                        </div>

                        <button
                          onClick={handleSaveMetadata}
                          className="btn btn-primary rounded-xl text-primary-content shadow-md shadow-primary/15 mt-4"
                          disabled={isSavingMetadata}
                        >
                          {isSavingMetadata
                            ? "Saving Changes..."
                            : "Save Metadata Changes"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mock Authentication Modal */}
      {isAuthModalOpen && (
        <div className="modal modal-open">
          <div className="modal-box rounded-3xl border border-base-content/10 shadow-2xl p-6 sm:p-8 bg-base-200">
            <h3 className="font-heading font-extrabold text-2xl mb-2 text-center">
              Sync Your History
            </h3>
            <p className="text-sm text-base-content/65 text-center mb-6 leading-relaxed">
              Sign in to keep your converted EPUBs. Your anonymous uploads will
              be linked to your profile.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleMockLogin("google")}
                className="btn btn-outline rounded-xl flex items-center justify-start gap-4 px-6 hover:bg-primary/5 hover:border-primary"
              >
                <div className="w-5 h-5 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center font-extrabold text-xs">
                  G
                </div>
                <span className="font-bold">Google Auth (Yann LeCun)</span>
              </button>
              <button
                onClick={() => handleMockLogin("facebook")}
                className="btn btn-outline rounded-xl flex items-center justify-start gap-4 px-6 hover:bg-info/5 hover:border-info"
              >
                <div className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-extrabold text-xs">
                  F
                </div>
                <span className="font-bold">
                  Facebook Auth (Andrey Karpathy)
                </span>
              </button>
              <button
                onClick={() => handleMockLogin("telegram")}
                className="btn btn-outline rounded-xl flex items-center justify-start gap-4 px-6 hover:bg-accent/5 hover:border-accent"
              >
                <div className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-500 flex items-center justify-center font-extrabold text-xs">
                  T
                </div>
                <span className="font-bold">
                  Telegram Auth (Demis Hassabis)
                </span>
              </button>
            </div>

            <div className="modal-action justify-center mt-6">
              <button
                onClick={() => setIsAuthModalOpen(false)}
                className="btn btn-ghost btn-sm rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};
