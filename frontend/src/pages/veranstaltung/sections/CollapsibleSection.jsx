import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export default function CollapsibleSection({ icon: Icon, title, count, defaultOpen = true, actions, children, className = '' }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`bg-gray-900 border border-gray-800 rounded-xl ${className}`}>
      <div className="flex items-center justify-between p-6 pb-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 text-left"
        >
          <span className="text-gray-500 hover:text-gray-300 transition-colors">
            {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            {Icon && <Icon className="w-5 h-5" />}
            {title}
            {count !== undefined && (
              <span className="text-sm font-normal text-gray-400">({count})</span>
            )}
          </h2>
        </button>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {open ? (
        <div className="p-6 pt-4">{children}</div>
      ) : (
        <div className="pb-4" />
      )}
    </section>
  );
}
