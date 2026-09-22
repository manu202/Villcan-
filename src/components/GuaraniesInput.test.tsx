import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { GuaraniesInput } from './GuaraniesInput';

// Controlled-input harness matching how every real call site will use it:
// parent owns the raw-digits state, component only formats for display.
function Harness({ initial = '', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <GuaraniesInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      placeholder="0"
    />
  );
}

function getInput() {
  return screen.getByPlaceholderText('0') as HTMLInputElement;
}

describe('GuaraniesInput', () => {
  it('formats a typed value with thousands separators (es-PY)', () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: '50000' } });
    expect(input.value).toBe('50.000');
  });

  it('onChange always receives plain digits, never separators', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: '50000' } });
    expect(onChange).toHaveBeenLastCalledWith('50000');
  });

  it('strips non-digit characters a user might paste/type (e.g. stray dots, letters)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: '5a0.000' } });
    expect(onChange).toHaveBeenLastCalledWith('50000');
  });

  it('collapses leading zeros but keeps a single "0"', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: '007' } });
    expect(onChange).toHaveBeenLastCalledWith('7');
  });

  it('renders empty when the raw value is empty', () => {
    render(<Harness initial="" />);
    expect(getInput().value).toBe('');
  });

  it('formats an incrementally-typed large number correctly at each step', () => {
    render(<Harness />);
    const input = getInput();
    fireEvent.change(input, { target: { value: '1' } });
    expect(input.value).toBe('1');
    fireEvent.change(input, { target: { value: '15' } });
    expect(input.value).toBe('15');
    fireEvent.change(input, { target: { value: '150' } });
    expect(input.value).toBe('150');
    fireEvent.change(input, { target: { value: '1500' } });
    expect(input.value).toBe('1.500');
    fireEvent.change(input, { target: { value: '15000' } });
    expect(input.value).toBe('15.000');
    fireEvent.change(input, { target: { value: '150000' } });
    expect(input.value).toBe('150.000');
  });

  // Real keystroke simulation via userEvent (jsdom's fireEvent doesn't
  // propagate selectionStart through change events, so these two tests use
  // userEvent instead — it drives the actual DOM selection APIs the browser
  // would, which is what GuaraniesInput's useLayoutEffect caret-restoration
  // logic (the component's core reliability property) actually depends on.
  it('keeps the caret anchored by digit count when typing in the middle (inserting before a separator)', async () => {
    const user = userEvent.setup();
    render(<Harness initial="15000" />);
    const input = getInput();
    expect(input.value).toBe('15.000');

    // Caret right after "15", before the dot -> type "9" there.
    // Digit sequence becomes 1,5,9,0,0,0 = "159000" -> displays "159.000",
    // and the caret must land right after the "9" (3 digits precede it).
    await user.type(input, '9', { initialSelectionStart: 2, initialSelectionEnd: 2 });

    expect(input.value).toBe('159.000');
    expect(input.selectionStart).toBe(3);
  });

  it('backspacing a digit next to the separator keeps the caret at the removal point, not stuck on the separator', async () => {
    const user = userEvent.setup();
    render(<Harness initial="150000" />);
    const input = getInput();
    expect(input.value).toBe('150.000');

    // Caret right after "150" (index 3), i.e. right before the dot.
    // Backspacing there removes the "0" just before it -> digits become
    // 1,5,0,0,0 = "15000" -> displays "15.000", caret should sit right
    // after the 2 remaining digits from that group (index 2).
    input.setSelectionRange(3, 3);
    input.focus();
    await user.keyboard('{Backspace}');

    expect(input.value).toBe('15.000');
    expect(input.selectionStart).toBe(2);
  });

  it('a fully-cleared input produces an empty raw value', () => {
    const onChange = vi.fn();
    render(<Harness initial="15000" onChange={onChange} />);
    fireEvent.change(getInput(), { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(getInput().value).toBe('');
  });
});
