import React, { useState, useRef } from "react";

interface BookUploadPanelProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  error?: string | null;
}

export const BookUploadPanel: React.FC<BookUploadPanelProps> = ({
  onUpload,
  isUploading,
  error,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const validateAndUpload = (file: File) => {
    setLocalError(null);
    const suffix = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();

    if (suffix !== ".epub" && suffix !== ".djvu" && suffix !== ".pdf") {
      setLocalError(
        "Unsupported format. Please upload a PDF, DJVU, or EPUB file.",
      );
      return;
    }

    onUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 sm:p-6 bg-base-200/50 border border-base-content/10 rounded-3xl backdrop-blur-md shadow-lg shadow-base-content/5">
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`relative group w-full h-80 rounded-2xl border-2 border-dashed flex flex-col justify-center items-center text-center p-6 cursor-pointer overflow-hidden transition-all duration-300 ${
          isDragActive
            ? "border-primary bg-primary/5 scale-[1.01]"
            : "border-base-content/25 hover:border-primary/50 hover:bg-base-content/5"
        }`}
        onClick={onButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".epub,.djvu,.pdf"
          onChange={handleChange}
          disabled={isUploading}
        />

        {isUploading ? (
          <div className="flex flex-col items-center gap-4 animate-fade-in">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <div className="flex flex-col gap-1">
              <p className="font-semibold text-lg text-base-content">
                Uploading Book...
              </p>
              <p className="text-sm text-base-content/60">
                Extracting content and initiating AI processing pipeline
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 transition-transform group-hover:scale-[1.02]">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-content transition-all duration-300">
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
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="font-heading font-extrabold text-xl">
                Drag & drop your book here
              </p>
              <p className="text-sm text-base-content/60">
                Supports PDF, DJVU or EPUB files up to 100MB
              </p>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-sm rounded-xl px-5 text-primary-content shadow-md shadow-primary/10 mt-2"
            >
              Browse Files
            </button>
          </div>
        )}
      </div>

      {(error || localError) && (
        <div className="alert alert-error mt-4 flex items-start gap-2 rounded-2xl shadow-sm text-left">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-sm">Upload Error</span>
            <span className="text-xs">{error || localError}</span>
          </div>
        </div>
      )}
    </div>
  );
};
