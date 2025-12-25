import React from 'react';

interface ParallelFetcherInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputMode: 'raw' | 'structured';
}

const safeParse = (str: string) => {
  try { return JSON.parse(str); } catch { return {}; }
};

export const ParallelFetcherInput: React.FC<ParallelFetcherInputProps> = ({
  inputVal,
  setInputVal,
  inputMode
}) => {
  const parsed = safeParse(inputVal);

  // OBJECTIVE mode - single textarea
  if (inputMode === 'raw') {
    return (
      <div className="complex-form structured-mode">
        <div className="form-group">
          <div className="form-row">
            <div className="label-col">
              <label style={{ color: '#00ffff' }}>ParallelSearchRequest</label>
              <span className="desc-tooltip">Direct search query for Parallel.ai</span>
            </div>
            <div className="input-col">
              <textarea
                className="terminal-input"
                style={{
                  minHeight: '120px',
                  resize: 'vertical',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid #333',
                  padding: '12px',
                  lineHeight: '1.5',
                  fontFamily: 'monospace'
                }}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={`Find information about the person named Seren Sandikci.\nEmail: seren@index.network\nLinkedIn: https://linkedin.com/in/seren\nTwitter: https://x.com/seren\nGitHub: https://github.com/seren\nWebsites: https://index.network`}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // STRUCT mode - form fields
  return (
    <div className="complex-form">
      {['name', 'email', 'linkedin', 'twitter', 'website', 'location', 'company', 'github'].map(field => (
        <div key={field} className="form-row">
          <label>{field}:</label>
          <input
            type="text"
            value={parsed[field] || ''}
            onChange={(e) => {
              const newObj = { ...parsed, [field]: e.target.value };
              setInputVal(JSON.stringify(newObj, null, 2));
            }}
            placeholder={`Enter ${field}...`}
          />
        </div>
      ))}
    </div>
  );
};

export default ParallelFetcherInput;
