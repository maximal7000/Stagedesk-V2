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
              className="text-blue-400 hover:text-blue-300 underline" />
          ),
          h1: ({ node, ...props }) => <h1 className="text-xl font-bold text-white mt-3 mb-2" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-lg font-bold text-white mt-3 mb-2" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-base font-semibold text-white mt-2 mb-1" {...props} />,
          p:  ({ node, ...props }) => <p className="text-gray-300 leading-relaxed mb-2 last:mb-0" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc list-inside text-gray-300 space-y-0.5 mb-2 ml-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal list-inside text-gray-300 space-y-0.5 mb-2 ml-2" {...props} />,
          li: ({ node, ...props }) => <li className="text-gray-300" {...props} />,
          strong: ({ node, ...props }) => <strong className="font-semibold text-white" {...props} />,
          em: ({ node, ...props }) => <em className="italic text-gray-200" {...props} />,
          code: ({ node, inline, ...props }) =>
            inline
              ? <code className="bg-gray-800 px-1 py-0.5 rounded text-blue-300 text-sm font-mono" {...props} />
              : <code className="block bg-gray-800 px-3 py-2 rounded text-blue-300 text-sm font-mono overflow-x-auto" {...props} />,
          pre: ({ node, ...props }) => <pre className="bg-gray-800 rounded my-2 overflow-x-auto" {...props} />,
          blockquote: ({ node, ...props }) =>
            <blockquote className="border-l-4 border-gray-700 pl-3 italic text-gray-400 my-2" {...props} />,
          hr: () => <hr className="border-gray-800 my-3" />,
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-sm border border-gray-800" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => <th className="px-2 py-1 bg-gray-800 text-left text-gray-300 border border-gray-700" {...props} />,
          td: ({ node, ...props }) => <td className="px-2 py-1 border border-gray-800 text-gray-300" {...props} />,
          input: ({ node, ...props }) =>
            props.type === 'checkbox'
              ? <input {...props} disabled className="mr-1.5 accent-blue-500" />
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
    <p className={`text-[11px] text-gray-500 mt-1 ${className}`}>
      Markdown unterstützt: <code className="text-gray-400">**fett**</code>,{' '}
      <code className="text-gray-400">*kursiv*</code>,{' '}
      <code className="text-gray-400">- Liste</code>,{' '}
      <code className="text-gray-400">[Link](url)</code>,{' '}
      <code className="text-gray-400">- [ ] Aufgabe</code>
    </p>
  );
}
