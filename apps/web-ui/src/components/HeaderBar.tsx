import React, { useState } from "react";
import { useTheme } from "./ThemeContext.jsx";

interface HeaderBarProps {
  displayName: string | null;
  currentBookTitle?: string | null;
  currentBookStatus?: string | null;
  onLogout: () => void;
  onLoginClick: () => void;
  onBackToHome: () => void;
  booksList?: Array<{ id: string; originalFileName: string; status: string }>;
  onSelectBook?: (bookId: string) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  displayName,
  currentBookTitle,
  currentBookStatus,
  onLogout,
  onLoginClick,
  onBackToHome,
  booksList = [],
  onSelectBook
}) => {
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="navbar sticky top-0 z-50 bg-base-100/80 backdrop-blur-md border-b border-base-content/10 px-4 sm:px-8 shadow-sm">
      {/* 1. Left Brand Block */}
      <div className="flex-1 flex items-center gap-3">
        <button 
          onClick={onBackToHome}
          className="flex items-center gap-2.5 transition-transform hover:scale-[1.02] focus:outline-none"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-accent flex items-center justify-center text-primary-content shadow-md shadow-primary/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <span className="font-heading font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-base-content to-base-content/80">
            AI Book Converter
          </span>
        </button>

        {/* 2. Left Current Book Selector Label */}
        <div className="hidden md:flex items-center ml-8 pl-8 border-l border-base-content/15 min-h-[40px]">
          {currentBookTitle ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-base-content/60">Active:</span>
              <span className="text-sm font-semibold max-w-[200px] truncate text-primary">
                {currentBookTitle}
              </span>
              {currentBookStatus && (
                <span className={`badge badge-sm font-mono ${
                  currentBookStatus === "ready" ? "badge-success" :
                  currentBookStatus === "processing" ? "badge-info animate-pulse" :
                  currentBookStatus === "failed" ? "badge-error" : "badge-ghost"
                }`}>
                  {currentBookStatus}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm font-medium text-base-content/40 italic">
              No book selected
            </span>
          )}
        </div>
      </div>

      {/* Right Side Buttons */}
      <div className="flex-none gap-4">
        {/* Day/Night Theme Toggle */}
        <button 
          onClick={toggleTheme} 
          className="btn btn-ghost btn-circle"
          aria-label="Toggle Theme"
        >
          {theme === "emerald" ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-warning" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.364l-.707-.707M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>

        {/* 3. Right Profile Dropdown Menu */}
        <div className="dropdown dropdown-end">
          <label 
            tabIndex={0} 
            className="btn btn-ghost btn-circle avatar border border-base-content/10 shadow-sm"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <div className="w-10 rounded-full bg-gradient-to-tr from-accent to-secondary flex items-center justify-center text-accent-content font-bold">
              {displayName ? displayName.charAt(0).toUpperCase() : "A"}
            </div>
          </label>
          {dropdownOpen && (
            <ul 
              tabIndex={0} 
              className="menu menu-sm dropdown-content mt-3 z-[100] p-3 shadow-xl bg-base-200 border border-base-content/10 rounded-2xl w-72"
            >
              <li className="menu-title px-2 py-1.5 border-b border-base-content/10 mb-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold uppercase text-base-content/40 tracking-wider">Account</span>
                  <span className="text-sm font-bold text-base-content">{displayName || "Anonymous Visitor"}</span>
                </div>
              </li>

              {/* History / Books list */}
              {booksList.length > 0 && (
                <>
                  <li className="menu-title px-2 mt-2 py-1 text-xs uppercase text-base-content/40 tracking-wider">Recent Processing</li>
                  <div className="max-h-40 overflow-y-auto mb-2 pr-1 custom-scrollbar">
                    {booksList.map(b => (
                      <li key={b.id}>
                        <button 
                          onClick={() => {
                            if (onSelectBook) onSelectBook(b.id);
                            setDropdownOpen(false);
                          }}
                          className="flex justify-between items-center py-2 px-2 hover:bg-base-300 rounded-lg text-left"
                        >
                          <span className="truncate max-w-[150px] text-xs font-medium">{b.originalFileName}</span>
                          <span className={`badge badge-xs font-mono scale-90 ${
                            b.status === "ready" ? "badge-success" :
                            b.status === "processing" ? "badge-info" : "badge-error"
                          }`}>{b.status}</span>
                        </button>
                      </li>
                    ))}
                  </div>
                </>
              )}

              {displayName ? (
                <li>
                  <button 
                    onClick={() => {
                      onLogout();
                      setDropdownOpen(false);
                    }}
                    className="btn btn-sm btn-outline btn-error w-full mt-2 justify-center rounded-xl"
                  >
                    Logout Account
                  </button>
                </li>
              ) : (
                <li>
                  <button 
                    onClick={() => {
                      onLoginClick();
                      setDropdownOpen(false);
                    }}
                    className="btn btn-sm btn-primary w-full mt-2 justify-center rounded-xl text-primary-content shadow-md shadow-primary/20"
                  >
                    Sign In / Sync History
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </header>
  );
};
