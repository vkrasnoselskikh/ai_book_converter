import React, { useState } from "react";

interface TocEntry {
  title: string;
  level: number;
  anchorId: string;
}

interface BookReaderProps {
  htmlContent: string;
  tocEntries: TocEntry[];
  title: string;
  authors: string[];
}

export const BookReader: React.FC<BookReaderProps> = ({
  htmlContent,
  tocEntries = [],
  title,
  authors
}) => {
  const [tocCollapsed, setTocCollapsed] = useState(false);

  const scrollToAnchor = (anchorId: string) => {
    const element = document.getElementById(anchorId);
    if (element) {
      window.history.replaceState(null, "", `#${anchorId}`);
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="flex h-[calc(100vh-65px)] overflow-hidden bg-base-100">
      {/* 1. Left Table of Contents Sidebar */}
      <aside className={`transition-all duration-300 border-r border-base-content/10 bg-base-200/40 backdrop-blur-md flex flex-col ${
        tocCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-80 opacity-100"
      }`}>
        <div className="p-4 border-b border-base-content/10 flex items-center justify-between">
          <span className="font-heading font-bold text-base uppercase tracking-wider text-base-content/60">Table of Contents</span>
          <button 
            onClick={() => setTocCollapsed(true)}
            className="btn btn-ghost btn-xs btn-circle"
            aria-label="Collapse TOC"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {tocEntries.length > 0 ? (
            <ul className="menu menu-xs w-full p-0 gap-1">
              {tocEntries.map((entry, idx) => (
                <li key={idx} style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
                  <a
                    href={`#${entry.anchorId}`}
                    onClick={(event) => {
                      event.preventDefault();
                      scrollToAnchor(entry.anchorId);
                    }}
                    className="py-2.5 px-3 rounded-xl hover:bg-base-content/5 text-left font-semibold text-base-content/85 block truncate"
                  >
                    {entry.title}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-sm text-base-content/40 italic">
              No sections detected.
            </div>
          )}
        </div>
      </aside>

      {/* Toggle button when collapsed */}
      {tocCollapsed && (
        <button 
          onClick={() => setTocCollapsed(false)}
          className="fixed left-4 bottom-4 z-40 btn btn-circle btn-primary text-primary-content shadow-lg shadow-primary/20 animate-bounce"
          title="Open Table of Contents"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      )}

      {/* 2. Main Content Viewport */}
      <main className="flex-1 overflow-y-auto p-6 sm:p-12 md:p-16 custom-scrollbar scroll-smooth">
        <div className="max-w-3xl mx-auto flex flex-col">
          {/* Header Cover Info */}
          <div className="mb-12 pb-8 border-b border-base-content/10">
            <h1 className="font-heading font-extrabold text-3xl sm:text-4xl text-base-content tracking-tight leading-tight mb-2">
              {title}
            </h1>
            <p className="text-lg font-medium text-primary">
              By {authors.join(", ")}
            </p>
          </div>

          {/* Compiled HTML preview text */}
          <article 
            className="prose prose-base sm:prose-lg max-w-none text-left leading-relaxed text-base-content/90"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      </main>
    </div>
  );
};
