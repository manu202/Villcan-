'use client';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

// Accessible switch replacing native `input[type=checkbox]` (REQ-THEME-6).
// Root cause of the old bug: the global `button,a,input,select,textarea
// { min-height/width: 44px }` rule in globals.css stretched native
// checkboxes past their intended 20x20 size. `.toggle` is a dedicated class
// selector, which beats that element-type selector on specificity, so this
// component is never subject to it.
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps) {
  const handleToggle = () => {
    if (disabled) return;
    onChange(!checked);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      className={`toggle ${checked ? 'toggle-on' : ''}`}
    >
      <span className="toggle-thumb" />

      <style>{`
        .toggle {
          position: relative;
          display: inline-flex;
          align-items: center;
          width: 44px;
          height: 24px;
          min-width: 44px;
          min-height: 24px;
          padding: 2px;
          border: 1px solid var(--border, var(--gray-300));
          border-radius: 999px;
          background: var(--gray-200);
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0;
        }

        .toggle.toggle-on {
          background: var(--accent, var(--black));
          border-color: var(--accent, var(--black));
        }

        .toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .toggle-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--white);
          transform: translateX(0);
          transition: transform 0.15s ease;
          box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.15));
        }

        .toggle.toggle-on .toggle-thumb {
          transform: translateX(20px);
        }
      `}</style>
    </button>
  );
}
