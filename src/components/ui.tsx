import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-teal text-ink-950 hover:bg-teal-soft font-semibold',
  secondary: 'bg-ink-800 text-fg hover:bg-ink-700 font-medium',
  ghost: 'text-fg-soft hover:bg-ink-800 hover:text-fg font-medium',
  danger: 'bg-transparent border border-rose/60 text-rose hover:bg-rose/10 font-medium',
};

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...props} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${className}`} />;
}

export function IconButton({ label, active, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...props}
      className={`inline-flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${active ? 'bg-teal-deep text-teal-soft' : 'text-fg-soft hover:bg-ink-800 hover:text-fg'} ${className}`}
    >
      {children}
    </button>
  );
}

/** Two or more mutually exclusive options. */
export function Segmented<T extends string | number>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full rounded-lg bg-ink-850 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${o.value === value ? 'bg-ink-700 text-fg' : 'text-fg-muted hover:text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-hidden rounded-xl border border-ink-700 bg-ink-900 p-0 text-fg"
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="flex items-center justify-between border-b border-ink-800 px-5 py-3">
          <h2 className="font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X size={18} />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-ink-800 px-5 py-3">{footer}</div> : null}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-fg-soft">{body}</div>
    </Modal>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-fg-soft">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-fg-muted">{hint}</span> : null}
    </label>
  );
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-4 md:px-8 md:py-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-fg-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    new: 'text-fg-muted border-ink-600',
    learning: 'text-fg-soft border-ink-600',
    difficult: 'text-amber border-amber/50',
    familiar: 'text-teal-soft border-teal/40',
    mastered: 'text-ink-950 bg-teal border-teal',
  };
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-xs capitalize ${tone[status] ?? tone.new}`}>{status}</span>;
}

export function RegisterBadge() {
  return <span className="inline-block rounded border border-amber/50 px-1.5 py-0.5 text-xs text-amber">Informal</span>;
}
