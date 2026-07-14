import { FileArchive, Upload, X } from "lucide-react";
import { labelClass } from "../lib/constants";

interface LicenseZipUploadFieldProps {
  id: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}

export function LicenseZipUploadField({
  id,
  file,
  onFileChange,
  disabled,
}: LicenseZipUploadFieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        Licence ZIP File
      </label>
      <label
        htmlFor={id}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-bg-main px-4 py-6 text-center transition-colors hover:border-accent-blue/50 hover:bg-bg-hover ${disabled ? "pointer-events-none opacity-60" : ""}`}
      >
        {file ? (
          <FileArchive className="h-8 w-8 text-accent-blue" />
        ) : (
          <Upload className="h-8 w-8 text-text-muted" />
        )}
        <span className="text-sm font-medium text-text-primary">
          {file ? file.name : "Upload password-protected licence ZIP"}
        </span>
        <span className="text-xs text-text-muted">.zip only</span>
        <input
          id={id}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            onFileChange(next);
          }}
        />
      </label>
      {file && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFileChange(null)}
          className="mt-2 flex items-center gap-1 text-xs text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          Remove file
        </button>
      )}
      <p className="mt-2 text-xs text-text-muted">
        The JSON file inside must match this Device ID, product InvoraLite, and your business
        email from Settings.
      </p>
    </div>
  );
}
