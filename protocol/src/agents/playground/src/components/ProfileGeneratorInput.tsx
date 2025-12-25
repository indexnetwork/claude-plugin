import React from 'react';

interface ProfileGeneratorInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputMode: 'raw' | 'structured';
}

const safeParse = (str: string) => {
  try { return JSON.parse(str); } catch { return {}; }
};

export const ProfileGeneratorInput: React.FC<ProfileGeneratorInputProps> = ({
  inputVal,
  setInputVal,
  inputMode
}) => {
  // RAW mode - single textarea for raw text
  if (inputMode === 'raw') {
    return (
      <div className="complex-form structured-mode">
        <div className="form-group">
          <div className="form-row">
            <div className="label-col">
              <label style={{ color: '#00ffff' }}>RawText</label>
              <span className="desc-tooltip">Raw text input for profile generation</span>
            </div>
            <div className="input-col">
              <textarea
                className="terminal-input"
                style={{
                  minHeight: '200px',
                  resize: 'vertical',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid #333',
                  padding: '12px',
                  lineHeight: '1.5',
                  fontFamily: 'monospace'
                }}
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Paste raw text about a person here. This could be scraped web content, a bio, or any text describing someone's professional background."
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // FROM_PARALLEL mode (structured) - editable array of result items
  const parsed = safeParse(inputVal);
  const hasParallelResult = parsed?.results && Array.isArray(parsed.results);

  const updateResult = (index: number, field: 'title' | 'excerpts', value: string) => {
    const newResults = [...parsed.results];
    if (field === 'excerpts') {
      newResults[index] = { ...newResults[index], excerpts: value.split('\n') };
    } else {
      newResults[index] = { ...newResults[index], [field]: value };
    }
    setInputVal(JSON.stringify({ ...parsed, results: newResults }, null, 2));
  };

  const removeResult = (index: number) => {
    const newResults = parsed.results.filter((_: any, i: number) => i !== index);
    setInputVal(JSON.stringify({ ...parsed, results: newResults }, null, 2));
  };

  return (
    <div className="complex-form structured-mode">
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '12px' }}>
            <label style={{ color: '#00ffff' }}>ParallelSearchResponse</label>
            <span className="desc-tooltip">Select from Context Memory or edit results below</span>
          </div>
          <div className="input-col" style={{ width: '100%' }}>
            {hasParallelResult ? (
              <div className="array-controls" style={{ display: 'flex', flexDirection: 'column', marginTop: '0', gap: '0' }}>
                <div className="preview-list" style={{ display: 'flex', flexDirection: 'column', gap: '0', width: '100%' }}>
                  {parsed.results.map((r: any, i: number) => (
                    <div key={i} style={{
                      display: 'flex',
                      flexDirection: 'column',
                      padding: '8px 0',
                      borderBottom: '1px solid #1a1a1a'
                    }}>
                      {/* Title Row */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        marginBottom: '4px'
                      }}>
                        {/* Cyan Index */}
                        <span style={{
                          color: '#00ffff',
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          minWidth: '20px',
                          textAlign: 'right'
                        }}>
                          {(i + 1).toString().padStart(2, '0')}
                        </span>

                        {/* Editable Title */}
                        <input
                          type="text"
                          spellCheck={false}
                          style={{
                            flex: 1,
                            background: 'transparent',
                            border: 'none',
                            color: '#e6e6e6',
                            outline: 'none',
                            fontSize: '0.9rem',
                            fontFamily: 'inherit',
                            fontWeight: 'bold'
                          }}
                          value={r.title || ''}
                          onChange={(e) => updateResult(i, 'title', e.target.value)}
                          placeholder="Title..."
                        />

                        {/* X Button (Right Aligned) */}
                        <button
                          className="icon-btn"
                          style={{
                            marginLeft: 'auto',
                            color: '#00ffff',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            fontSize: '1.2rem',
                            lineHeight: '1'
                          }}
                          onClick={() => removeResult(i)}
                          title="Remove Item"
                        >
                          ×
                        </button>
                      </div>

                      {/* Content Textarea */}
                      <div style={{ paddingLeft: '32px' }}>
                        <textarea
                          spellCheck={false}
                          value={(r.excerpts || []).join('\n')}
                          onChange={(e) => updateResult(i, 'excerpts', e.target.value)}
                          placeholder="Content (one excerpt per line)..."
                          style={{
                            width: '100%',
                            minHeight: '60px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px dashed #333',
                            color: '#e6e6e6',
                            padding: '8px',
                            resize: 'vertical',
                            outline: 'none',
                            fontFamily: 'monospace',
                            fontSize: '0.85rem'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed #333',
                borderRadius: '4px',
                padding: '20px',
                textAlign: 'center',
                color: '#666'
              }}>
                Click on a <span style={{ color: '#00ffff' }}>parallel-search-response</span> from Context Memory to load it here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileGeneratorInput;
