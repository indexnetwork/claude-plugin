import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Code, LayoutTemplate } from 'lucide-react';
import { json2md } from '../../../../lib/json2md/json2md';

interface GeneralInputProps {
  // Data
  value: string;
  onChange: (val: string) => void;
  previewValue?: string; // Optional override for markdown preview content

  // Display
  label?: string;
  badge?: string;

  // Modes & Features
  viewMode?: 'edit' | 'preview';
  onViewModeChange?: (mode: 'edit' | 'preview') => void;
  allowPreview?: boolean;
  allowJson2Md?: boolean;
  allowMarkdown?: boolean;

  // Custom Controls
  headerControls?: React.ReactNode;
  footerActions?: React.ReactNode;

  // Content Overrides
  children?: React.ReactNode;
}

export const GeneralInput: React.FC<GeneralInputProps> = ({
  value,
  onChange,
  previewValue,
  label = 'INPUT_BUFFER',
  badge,
  viewMode = 'edit',
  onViewModeChange,
  allowPreview = false,
  allowJson2Md = false,
  allowMarkdown = true,
  headerControls,
  footerActions,
  children
}) => {
  // Support Uncontrolled View Mode:
  // If onViewModeChange is not provided, we manage state internally.
  const [internalViewMode, setInternalViewMode] = React.useState<'edit' | 'preview'>(viewMode || 'edit');

  const isControlled = !!onViewModeChange;
  const currentViewMode = isControlled ? viewMode : internalViewMode;

  const handleModeChange = (mode: 'edit' | 'preview') => {
    if (isControlled) {
      onViewModeChange?.(mode);
    } else {
      setInternalViewMode(mode);
    }
  };

  const getExtensions = () => {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return [json()];
    }
    return allowMarkdown ? [markdown()] : [];
  };

  const handleJson2Md = () => {
    try {
      let obj;
      try {
        obj = JSON.parse(value);
      } catch (e) {
        // Output detailed error if it fails later, but try loose parse first
        // Support JS Object literals (unquoted keys) common in dev tools
        try {
          obj = new Function('return ' + value)();
        } catch {
          throw e; // Throw original JSON error if loose parse also fails
        }
      }

      const md = json2md.toMarkdown(obj);
      onChange(md.trim());
    } catch (e: unknown) {
      console.error("Failed to convert JSON to MD", e);
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Failed to convert: ${msg}`);
    }
  };

  /* CONTENT */
  const renderContent = () => {
    if (currentViewMode === 'preview') {
      return (
        <div className="markdown-preview" style={{
          color: '#d4d4d4',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '14px',
          lineHeight: '1.6',
          padding: '16px',
          height: '100%',
          overflow: 'auto'
        }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {previewValue || value}
          </ReactMarkdown>
        </div>
      );
    }

    if (children) {
      return children;
    }

    return (
      <CodeMirror
        value={value}
        height="100%"
        theme={vscodeDark}
        extensions={getExtensions()}
        onChange={onChange}
        style={{ fontSize: '14px', height: '100%', fontFamily: "'JetBrains Mono', monospace" }}
      />
    );
  };

  return (
    <div className="panel input-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* HEADER */}
      <div className="panel-header">
        <div className="title-group">
          <span className="panel-label">{label}</span>
          {badge && <span className="badge">{badge}</span>}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {allowPreview && (
            <div className="mode-toggle">
              <button
                className={`mode-btn ${currentViewMode === 'edit' ? 'active' : ''}`}
                onClick={() => handleModeChange('edit')}
              >
                <Code size={14} /> Write
              </button>
              <button
                className={`mode-btn ${currentViewMode === 'preview' ? 'active' : ''}`}
                onClick={() => handleModeChange('preview')}
              >
                <LayoutTemplate size={14} /> Preview
              </button>
            </div>
          )}
          {headerControls}
        </div>
      </div>

      {/* CONTENT */}
      <div className="input-content" style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div style={{
          height: '100%',
          width: '100%',
          backgroundColor: 'var(--term-bg)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {renderContent()}
        </div>
      </div>

      {/* FOOTER actions */}
      <div className="actions-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="left-actions">
          {allowMarkdown && allowJson2Md && currentViewMode === 'edit' && (
            <button
              className="action-btn"
              onClick={handleJson2Md}
              style={{
                background: 'transparent',
                border: '1px solid #00ffff',
                color: '#00ffff',
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '6px 12px',
                borderRadius: '4px',
                marginRight: 'auto'
              }}
              title="Convert JSON to Markdown"
            >
              JSON → MD
            </button>
          )}
        </div>
        <div className="right-actions">
          {footerActions}
        </div>
      </div>
    </div>
  );
};
