import { useState, useCallback } from "react";
import type { KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { isValidAddress, isValidTxHash } from "@/lib/format";

interface AddressInputProps {
  placeholder: string;
  onSubmit: (value: string) => void;
  loading?: boolean;
  validate?: "address" | "txhash" | "any";
  externalValue?: string;
}

export function AddressInput({ placeholder, onSubmit, loading, validate = "address", externalValue }: AddressInputProps) {
  const [value, setValue] = useState(externalValue ?? "");
  const [invalid, setInvalid] = useState(false);
  const [prevExternal, setPrevExternal] = useState(externalValue);

  if (externalValue !== prevExternal) {
    setPrevExternal(externalValue);
    if (externalValue !== undefined) {
      setValue(externalValue);
      setInvalid(false);
    }
  }

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    if (validate === "address" && !isValidAddress(trimmed)) {
      setInvalid(true);
      return;
    }
    if (validate === "txhash" && !isValidTxHash(trimmed)) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onSubmit(trimmed);
  }, [value, validate, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Enter") submit();
    },
    [submit],
  );

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setInvalid(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          spellCheck={false}
          className={`w-full bg-bg-input border ${
            invalid ? "border-error" : "border-fg-faint focus:border-accent"
          } text-fg text-sm px-4 py-3 outline-none transition-colors placeholder:text-fg-muted font-mono`}
        />
        {invalid && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-error font-medium">
            Invalid
          </span>
        )}
      </div>
      <button
        onClick={submit}
        disabled={loading}
        className="px-4 border border-fg text-fg text-sm font-semibold uppercase tracking-[0.04em] hover:bg-fg hover:text-bg transition-colors disabled:opacity-30 disabled:pointer-events-none"
      >
        {loading ? (
          <span className="inline-block w-4 h-4 border-2 border-fg-muted border-t-transparent rounded-full animate-spin" />
        ) : (
          <Search size={16} />
        )}
      </button>
    </div>
  );
}
