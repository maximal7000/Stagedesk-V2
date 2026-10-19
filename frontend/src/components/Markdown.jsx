/**
 * Markdown-Renderer für Beschreibungstexte. Nutzt react-markdown + GFM
 * (Tabellen, Strikethrough, Tasklists, Autolinks). Styles passen sich
 * an unser Dark-Theme an.
 */
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children, className = '' }) {
  if (!children) return null;
  return (
    <div className={`prose-stagedesk ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer"
              className="text-accent-fg hover:text-fg underline" />
          ),
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-fg mt-3 mb-2" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-fg mt-3 mb-2" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-fg mt-2 mb-1" {...props} />,
          p:  ({ node, ...props }) => <p className="text-fg-muted leading-relaxed mb-2 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside text-fg-muted space-y-0.5 mb-2 ml-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside text-fg-muted space-y-0.5 mb-2 ml-2" {...props} />,
          li: ({ node, ...props }) => <li className="text-fg-muted" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-fg" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-fg" {...props} />,
          code: ({ node, inline, ...props }) =>
            inline
              ? <code className="bg-raised px-1 py-0.5 rounded-sm text-fg text-sm font-mono" {...props} />
              : <code className="block bg-raised px-3 py-2 rounded-sm text-fg text-sm font-mono overflow-x-auto" {...props} />,
          pre: ({ node, ...props }) => <pre className="bg-raised rounded-sm my-2 overflow-x-auto" {...props} />,
          blockquote: ({ node, ...props }) =>
            <blockquote className="border-l-4 border-line pl-3 italic text-fg-muted my-2" {...props} />,
          hr: () => <hr className="border-line-subtle my-3" />,
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-sm border border-line-subtle" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => <th className="px-2 py-1 bg-raised text-left text-fg-muted border border-line" {...props} />,
          td: ({ node, ...props }) => <td className="px-2 py-1 border border-line-subtle text-fg-muted" {...props} />,
          input: ({ node, ...props }) =>
            props.type === 'checkbox'
              ? <input {...props} disabled className="mr-1.5 accent-accent" />
              : <input {...props} />,
        }}
      >
        {String(children)}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Kleine Hilfsanzeige unterhalb einer Textarea: erklärt, dass Markdown
 * unterstützt wird, mit Beispielen.
 */
export function MarkdownHint({ className = '' }) {
  return (
    <p className={`text-[11px] text-fg-subtle mt-1 ${className}`}>
      Markdown unterstützt: <code className="text-fg-muted">**fett**</code>,{' '}
      <code className="text-fg-muted">*kursiv*</code>,{' '}
      <code className="text-fg-muted">- Liste</code>,{' '}
      <code className="text-fg-muted">[Link](url)</code>,{' '}
      <code className="text-fg-muted">- [ ] Aufgabe</code>
    </p>
  );
}
