import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './rich-text.css';

export function RichText({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`rich-text${className ? ` ${className}` : ''}`}>
      <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
    </div>
  );
}
