import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { usePermissions } from "../hooks/usePermissions";
import { addCategory, getCategories, removeCategory } from "../lib/categories";
import { inputClass } from "../lib/constants";

interface CategorySelectProps {
  value: string;
  onChange: (category: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

type ModalMode = "select" | "manage";

export function CategorySelect({
  value,
  onChange,
  placeholder = "Item category",
  disabled = false,
}: CategorySelectProps) {
  const { canManageProducts } = usePermissions();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ModalMode>("select");
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState("");
  const [categoryToRemove, setCategoryToRemove] = useState<string | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    void getCategories().then(setCategories);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (mode === "manage") {
        setMode("select");
        setError("");
        setNewCategory("");
      } else {
        close();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, mode]);

  function close() {
    setOpen(false);
    setMode("select");
    setNewCategory("");
    setError("");
  }

  function select(category: string) {
    onChange(category);
    close();
  }

  async function handleAddCategory() {
    setError("");
    const trimmed = newCategory.trim();
    if (!trimmed) {
      setError("Enter a category name.");
      return;
    }
    if (categories.some((c) => c.toLowerCase() === trimmed.toLowerCase())) {
      setError("That category already exists.");
      return;
    }

    const next = await addCategory(trimmed);
    setCategories(next);
    setNewCategory("");
    if (value && !next.includes(value)) {
      onChange(next[0] ?? "");
    }
  }

  async function handleRemoveCategory(category: string) {
    setError("");
    if (categories.length <= 1) {
      setError("Keep at least one category.");
      return;
    }

    const next = await removeCategory(category);
    setCategories(next);
    if (value === category) {
      onChange(next[0] ?? "");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className={`${inputClass} flex h-[42px] shrink-0 items-center justify-between gap-2 self-start text-left disabled:cursor-not-allowed disabled:opacity-60`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={placeholder}
      >
        <span className={value ? "text-text-primary" : "text-text-muted"}>
          {value || placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={close}
          role="presentation"
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <div className="border-b border-border/60 px-5 py-4">
              <h4 id={titleId} className="text-base font-semibold text-text-primary">
                {mode === "select" ? "Select item category" : "Add & Remove Category"}
              </h4>
            </div>

            {mode === "select" ? (
              <>
                <ul className="max-h-72 overflow-y-auto">
                  {categories.length === 0 ? (
                    <li className="px-5 py-4 text-sm text-text-muted">No categories yet</li>
                  ) : (
                    categories.map((category, index) => (
                      <li key={category}>
                        <button
                          type="button"
                          onClick={() => select(category)}
                          className={`flex w-full px-5 py-3.5 text-left text-sm font-medium transition-colors ${
                            category === value
                              ? "bg-accent-blue text-white"
                              : "text-text-primary hover:bg-bg-hover"
                          }`}
                        >
                          {category}
                        </button>
                        {index < categories.length - 1 && (
                          <div className="mx-5 border-b border-border/50" />
                        )}
                      </li>
                    ))
                  )}
                </ul>

                <div className="space-y-2 border-t border-border/60 p-4">
                  {canManageProducts && (
                  <button
                    type="button"
                    onClick={() => setMode("manage")}
                    className="w-full rounded-full border border-accent-blue/40 py-3 text-sm font-semibold text-accent-blue transition-colors hover:bg-accent-blue/10"
                  >
                    Add & Remove Category
                  </button>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    className="w-full rounded-full border border-border py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-hover"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4 p-5">
                <div className="flex gap-2">
                  <input
                    value={newCategory}
                    onChange={(e) => {
                      setNewCategory(e.target.value);
                      setError("");
                    }}
                    placeholder="New category name"
                    className={inputClass}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddCategory();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddCategory()}
                    className="flex shrink-0 items-center gap-1 rounded-xl bg-accent-blue px-4 py-2.5 text-sm font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </button>
                </div>

                {error && (
                  <p className="rounded-xl bg-accent-red/10 px-3 py-2 text-sm text-accent-red">{error}</p>
                )}

                <ul className="max-h-52 overflow-y-auto rounded-xl border border-border">
                  {categories.map((category) => (
                    <li
                      key={category}
                      className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-0"
                    >
                      <span className="text-sm text-text-primary">{category}</span>
                      <button
                        type="button"
                        onClick={() => setCategoryToRemove(category)}
                        className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-accent-red/10 hover:text-accent-red"
                        aria-label={`Remove ${category}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => {
                    setMode("select");
                    setError("");
                    setNewCategory("");
                  }}
                  className="w-full rounded-full border border-border py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-hover"
                >
                  Back to categories
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={categoryToRemove !== null}
        title="Remove category?"
        description={
          categoryToRemove
            ? `Remove "${categoryToRemove}"? Products using this category will switch to another category.`
            : undefined
        }
        confirmLabel="Remove"
        confirmTone="danger"
        onClose={() => setCategoryToRemove(null)}
        onConfirm={async () => {
          if (categoryToRemove) {
            await handleRemoveCategory(categoryToRemove);
            setCategoryToRemove(null);
          }
        }}
      />
    </>
  );
}
