/**
 * Autocomplete-Eingabe: Aus Liste wählen oder neuen Eintrag anlegen (keine Dummy-Daten).
 */
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

export default function AutocompleteInput({
  options = [],
  valueId = '',
  displayName = '',
  onChange,
  onCreateNew,
  placeholder = 'Suchen oder neu anlegen...',
  disabled = false,
  getOptionLabel = (o) => o.name,
  getOptionValue = (o) => o.id,
  className = '',
}) {
  const [inputValue, setInputValue] = useState(displayName || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const containerRef = useRef(null);

  useEffect(() => {
    setInputValue(displayName || '');
  }, [displayName, valueId]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const filtered = inputValue.trim()
    ? options.filter(o => getOptionLabel(o).toLowerCase().includes(inputValue.trim().toLowerCase()))
    : options;
  const exactMatch = options.find(o => getOptionLabel(o).toLowerCase() === inputValue.trim().toLowerCase());
  const showCreate = inputValue.trim() && !exactMatch && onCreateNew;

  const select = (opt) => {
    if (!opt) return;
    const id = getOptionValue(opt);
    const name = getOptionLabel(opt);
    onChange(id, name);
    setInputValue(name);
    setOpen(false);
  };

  const handleCreate = async () => {
    if (!inputValue.trim() || !onCreateNew) return;
    try {
      const created = await onCreateNew(inputValue.trim());
      if (created) {
        onChange(getOptionValue(created), getOptionLabel(created));
        setInputValue(getOptionLabel(created));
        setOpen(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
        setHighlight(0);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = showCreate ? highlight + 1 : highlight + 1;
      const max = (showCreate ? filtered.length + 1 : filtered.length) - 1;
      setHighlight(Math.min(next, max));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(Math.max(0, highlight - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showCreate && highlight === filtered.length) {
        handleCreate();
        return;
      }
      const opt = filtered[highlight];
      if (opt) select(opt);
      return;
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value;
          setInputValue(v);
          setOpen(true);
          setHighlight(-1);
          if (!v.trim()) onChange('', '');
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-3 py-2 pr-9 bg-raised border border-line hover:border-line-strong focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none rounded-md text-fg placeholder:text-fg-subtle disabled:text-fg-disabled"
      />
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" />

      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-20 left-0 right-0 mt-1 py-1 bg-overlay border border-line rounded-lg shadow-overlay max-h-48 overflow-y-auto">
          {filtered.map((opt, i) => (
            <li
              key={getOptionValue(opt)}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => select(opt)}
              className={`px-3 py-2 cursor-pointer text-sm ${
                highlight === i ? 'bg-hover text-fg' : 'text-fg-muted hover:bg-hover'
              }`}
            >
              {getOptionLabel(opt)}
            </li>
          ))}
          {showCreate && (
            <li
              onMouseEnter={() => setHighlight(filtered.length)}
              onClick={handleCreate}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm border-t border-line-subtle ${
                highlight === filtered.length ? 'bg-accent text-white' : 'text-accent-fg hover:bg-hover'
              }`}
            >
              <Plus className="w-4 h-4" />
              Neu anlegen: „{inputValue.trim()}“
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
