import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function CollapsibleSection({ icon: Icon, title, count, defaultOpen = true, actions, children, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`border-t border-line-subtle pt-5 ${className}`}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-fg-subtle hover:text-fg-muted transition-colors">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-fg">
            {Icon && <Icon className="w-5 h-5 text-fg-subtle" />}
            {title}
            {count !== undefined && (
              <span className="text-sm font-normal text-fg-muted tabular-nums">({count})</span>
            )}
          </h2>
        </button>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {open ? (
        <div className="pt-4 pb-2">{children}</div>
      ) : (
        <div className="pb-2" />
      )}
    </section>
  );
}
