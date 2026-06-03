"use client";

type Props = {
  id: string;
  label: string;
  hint?: string;
  accept?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  className?: string;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileUploadField({
  id,
  label,
  hint,
  accept,
  file,
  onChange,
  className = "",
}: Props) {
  return (
    <div className={`rounded-2xl border border-zinc-200 bg-white p-3 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-700">{label}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label
          htmlFor={id}
          className="cursor-pointer rounded-lg border border-zinc-300 bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-800 transition hover:bg-zinc-200"
        >
          Elegir archivo
        </label>
        {file ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg border border-rose-200/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-100 transition hover:bg-rose-500/20"
          >
            Quitar
          </button>
        ) : null}
      </div>
      <input
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <p className="mt-2 break-all text-xs text-zinc-700">
        {file ? `${file.name} (${formatFileSize(file.size)})` : "Ningun archivo seleccionado"}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-zinc-500">{hint}</p> : null}
    </div>
  );
}
