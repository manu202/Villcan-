'use client';

import { useLayoutEffect, useRef } from 'react';

interface GuaraniesInputProps {
  id?: string;
  /** Raw digits only (no formatting), e.g. "50000". Empty string means empty. */
  value: string;
  /** Called with the new raw-digits value (never contains separators). */
  onChange: (rawDigits: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

/** Digits only, no leading zeros (except a single "0"). */
function toRawDigits(input: string): string {
  const digitsOnly = input.replace(/\D/g, '');
  const noLeadingZeros = digitsOnly.replace(/^0+(?=\d)/, '');
  return noLeadingZeros;
}

/** "50000" -> "50.000" (es-PY thousands separator, matches formatGuaranies). */
function formatDigits(rawDigits: string): string {
  if (rawDigits === '') return '';
  return Number(rawDigits).toLocaleString('es-PY');
}

/**
 * Live-formatting money input for Guaraní amounts: inserts thousands
 * separators as the user types, while keeping the caret in the right place
 * (the caret is anchored to "how many digits are before it", not to a raw
 * character index, since inserted "." characters shift positions).
 *
 * onChange always receives plain digits (e.g. "50000"), never a formatted
 * string — callers never need to parse/strip separators themselves.
 */
export function GuaraniesInput({
  id,
  value,
  onChange,
  placeholder = '0',
  className,
  autoFocus,
  disabled,
}: GuaraniesInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  // Caret position (in digit-count terms) to restore after the next render,
  // set synchronously inside the change handler and consumed in
  // useLayoutEffect so it applies before the browser paints.
  const pendingCaretDigits = useRef<number | null>(null);

  const displayValue = formatDigits(value);

  useLayoutEffect(() => {
    const el = inputRef.current;
    const digitsBeforeCaret = pendingCaretDigits.current;
    if (!el || digitsBeforeCaret === null) return;
    pendingCaretDigits.current = null;

    // Walk the formatted string until `digitsBeforeCaret` digits have been
    // passed — that index is where the caret belongs.
    let seen = 0;
    let pos = displayValue.length;
    if (digitsBeforeCaret <= 0) {
      pos = 0;
    } else {
      for (let i = 0; i < displayValue.length; i++) {
        if (/\d/.test(displayValue[i])) {
          seen++;
          if (seen === digitsBeforeCaret) {
            pos = i + 1;
            break;
          }
        }
      }
    }
    el.setSelectionRange(pos, pos);
  }, [displayValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawInput = e.target.value;
    const caretIndex = e.target.selectionStart ?? rawInput.length;

    // How many digits precede the caret in what the user just typed —
    // this count is preserved across reformatting.
    let digitsBeforeCaret = 0;
    for (let i = 0; i < caretIndex; i++) {
      if (/\d/.test(rawInput[i])) digitsBeforeCaret++;
    }

    const nextRawDigits = toRawDigits(rawInput);
    // toRawDigits can drop leading zeros, which can reduce the digit count
    // relative to what was typed (e.g. "0" + "5" typed as "05" -> "5") —
    // clamp so the caret never overshoots the new value's digit count.
    pendingCaretDigits.current = Math.min(digitsBeforeCaret, nextRawDigits.length);

    onChange(nextRawDigits);
  };

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      className={className}
      autoFocus={autoFocus}
      disabled={disabled}
    />
  );
}
