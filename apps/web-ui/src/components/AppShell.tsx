import React from "react";
import { HeaderBar } from "./HeaderBar.jsx";

interface AppShellProps {
  children: React.ReactNode;
  displayName: string | null;
  currentBookTitle?: string | null;
  currentBookStatus?: string | null;
  onLogout: () => void;
  onLoginClick: () => void;
  onBackToHome: () => void;
  booksList?: Array<{ id: string; originalFileName: string; status: string }>;
  onSelectBook?: (bookId: string) => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  displayName,
  currentBookTitle,
  currentBookStatus,
  onLogout,
  onLoginClick,
  onBackToHome,
  booksList = [],
  onSelectBook
}) => {
  return (
    <div className="min-h-screen flex flex-col bg-base-100 text-base-content antialiased">
      {/* Dynamic Header */}
      <HeaderBar
        displayName={displayName}
        currentBookTitle={currentBookTitle}
        currentBookStatus={currentBookStatus}
        onLogout={onLogout}
        onLoginClick={onLoginClick}
        onBackToHome={onBackToHome}
        booksList={booksList}
        onSelectBook={onSelectBook}
      />

      {/* Main Content Pane */}
      <div className="flex-1 w-full flex flex-col">
        {children}
      </div>

      {/* Premium Footer */}
      <footer className="footer footer-center p-6 bg-base-200 border-t border-base-content/5 text-base-content/60 text-xs font-semibold uppercase tracking-wider">
        <div>
          <p>© {new Date().getFullYear()} AI Book Converter — Premium E-Book Extraction Platform</p>
        </div>
      </footer>
    </div>
  );
};
