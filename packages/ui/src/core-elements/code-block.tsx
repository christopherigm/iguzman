'use client';

import React, { CSSProperties, useState } from 'react';
import { UIComponentProps, buildStyleProps } from './utils';
import { Button } from './button';
import './code-block.css';

const CopyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export interface CodeBlockProps extends UIComponentProps {
  /** The code string to display. */
  code: string;
  /** Optional language label rendered in the header bar. */
  language?: string;
  /** Whether to show the copy-to-clipboard button. Defaults to `true`. */
  showCopy?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = (props) => {
  const { code, language, showCopy = true, className, id, styles } = props;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API unavailable in non-secure contexts
    }
  };

  const hasHeader = language != null || showCopy;

  const outerStyle: CSSProperties = { ...buildStyleProps(props), ...styles };

  return (
    <div
      id={id}
      className={['ui-code-block', className].filter(Boolean).join(' ')}
      style={outerStyle}
    >
      {hasHeader && (
        <div className="ui-code-block-header">
          {language != null && (
            <span className="ui-code-block-lang">{language}</span>
          )}
          {showCopy && (
            <span className="ui-code-block-copy-wrap">
              <Button
                unstyled
                aria-label="Copy code"
                title={copied ? 'Copied!' : 'Copy code'}
                onClick={handleCopy}
                color={copied ? 'var(--accent, #06b6d4)' : 'var(--foreground-muted, #888)'}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </span>
          )}
        </div>
      )}
      <pre className="ui-code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
