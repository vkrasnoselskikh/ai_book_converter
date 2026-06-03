import React, { useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";

interface TocEntry {
  title: string;
  level: number;
  anchorId: string;
}

interface BookReaderProps {
  htmlContent: string;
  markdownPages: PreviewMarkdownPage[];
  endnotes: PreviewEndnote[];
  tocEntries: TocEntry[];
  title: string;
  authors: string[];
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

export const BookReader: React.FC<BookReaderProps> = ({
  htmlContent,
  markdownPages = [],
  endnotes = [],
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

  const handleAnchorClick = (
    event: React.MouseEvent<HTMLAnchorElement>,
    href: string | undefined,
  ) => {
    if (!href?.startsWith("#")) {
      return;
    }

    event.preventDefault();
    scrollToAnchor(href.slice(1));
  };

  const markdownComponents: Components = {
    h1({ children }) {
      return (
        <h1 className="mb-5 mt-10 scroll-mt-24 border-b border-base-content/10 pb-4 font-heading text-3xl font-extrabold leading-tight text-base-content sm:text-4xl">
          {children}
        </h1>
      );
    },
    h2({ children }) {
      return (
        <h2 className="mb-4 mt-9 scroll-mt-24 font-heading text-2xl font-bold leading-tight text-base-content sm:text-3xl">
          {children}
        </h2>
      );
    },
    h3({ children }) {
      return (
        <h3 className="mb-3 mt-7 scroll-mt-24 font-heading text-xl font-bold leading-snug text-base-content sm:text-2xl">
          {children}
        </h3>
      );
    },
    h4({ children }) {
      return (
        <h4 className="mb-3 mt-6 scroll-mt-24 font-heading text-lg font-semibold leading-snug text-base-content">
          {children}
        </h4>
      );
    },
    p({ children }) {
      return <p className="mb-5 leading-8 text-base-content/90">{children}</p>;
    },
    a({ href, children }) {
      const isAnchor = href?.startsWith("#") || false;
      return (
        <a
          href={href}
          onClick={(event) => handleAnchorClick(event, href)}
          target={isAnchor ? undefined : "_blank"}
          rel={isAnchor ? undefined : "noopener noreferrer"}
          className="link link-primary font-medium decoration-primary/40 decoration-2 underline-offset-4 hover:decoration-primary"
        >
          {children}
        </a>
      );
    },
    strong({ children }) {
      return <strong className="font-bold text-base-content">{children}</strong>;
    },
    em({ children }) {
      return <em className="text-base-content/80">{children}</em>;
    },
    blockquote({ children }) {
      return (
        <blockquote className="my-7 rounded-md border-l-4 border-primary bg-primary/5 px-5 py-4 text-base-content/85">
          {children}
        </blockquote>
      );
    },
    ul({ children }) {
      return <ul className="mb-6 ml-6 list-disc space-y-2 leading-8">{children}</ul>;
    },
    ol({ children }) {
      return <ol className="mb-6 ml-6 list-decimal space-y-2 leading-8">{children}</ol>;
    },
    li({ children }) {
      return <li className="pl-2 text-base-content/90">{children}</li>;
    },
    hr() {
      return <hr className="my-10 border-base-content/10" />;
    },
    img({ src, alt }) {
      return (
        <figure className="my-8">
          <img
            src={src || ""}
            alt={alt || ""}
            loading="lazy"
            className="mx-auto max-h-[720px] max-w-full rounded-md border border-base-content/10 bg-base-200 object-contain shadow-sm"
          />
          {alt && (
            <figcaption className="mt-3 text-center text-sm text-base-content/60">
              {alt}
            </figcaption>
          )}
        </figure>
      );
    },
    pre({ children }) {
      return (
        <div className="mockup-code my-7 overflow-x-auto rounded-md bg-neutral text-neutral-content shadow-sm">
          <pre className="px-5 py-4 text-sm leading-7">{children}</pre>
        </div>
      );
    },
    code({ className, children }) {
      const isLanguageBlock = /language-\w+/.test(className || "");
      const isBlock = isLanguageBlock || String(children).includes("\n");
      if (isBlock) {
        return (
          <code className={`${className || ""} font-mono text-sm`}>
            {children}
          </code>
        );
      }

      return (
        <code className="rounded bg-base-200 px-1.5 py-0.5 font-mono text-sm text-secondary">
          {children}
        </code>
      );
    },
    table({ children }) {
      return (
        <div className="my-8 overflow-x-auto rounded-md border border-base-content/10 bg-base-100 shadow-sm">
          <table className="table table-zebra table-pin-rows w-full text-sm">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }) {
      return <thead className="bg-base-200 text-base-content">{children}</thead>;
    },
    tbody({ children }) {
      return <tbody>{children}</tbody>;
    },
    tr({ children }) {
      return (
        <tr className="border-b border-base-content/10 last:border-b-0">
          {children}
        </tr>
      );
    },
    th({ children }) {
      return (
        <th className="whitespace-nowrap bg-base-200 px-4 py-3 text-left font-bold text-base-content">
          {children}
        </th>
      );
    },
    td({ children }) {
      return (
        <td className="px-4 py-3 align-top text-base-content/85">
          {children}
        </td>
      );
    },
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

          <article className="book-article max-w-none text-left text-base leading-relaxed text-base-content/90 sm:text-lg">
            {markdownPages.length > 0 ? (
              <>
                {markdownPages.map((page) => (
                  <section
                    id={page.anchorId}
                    key={page.anchorId || page.pageIndex}
                    className="scroll-mt-24 border-b border-base-content/5 py-8 first:pt-0 last:border-b-0"
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={markdownComponents}
                    >
                      {page.markdown}
                    </ReactMarkdown>
                  </section>
                ))}
                {endnotes.length > 0 && (
                  <section id="endnotes">
                    <h2 className="mb-4 mt-10 border-t border-base-content/10 pt-8 font-heading text-2xl font-bold text-base-content">
                      Endnotes
                    </h2>
                    <ol className="ml-6 list-decimal space-y-2">
                      {endnotes.map((endnote) => (
                        <li
                          id={endnote.noteId}
                          key={endnote.noteId}
                          className="pl-2 leading-7 text-base-content/85"
                        >
                          {endnote.marker !== null ? `[${endnote.marker}] ` : ""}
                          {endnote.text}
                          {endnote.linked && (
                            <>
                              {" "}
                              <a
                                href={`#${endnote.refId}`}
                                onClick={(event) =>
                                  handleAnchorClick(event, `#${endnote.refId}`)
                                }
                              >
                                ↩
                              </a>
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  </section>
                )}
              </>
            ) : (
              <div
                className="legacy-article-content"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            )}
          </article>
        </div>
      </main>
    </div>
  );
};
