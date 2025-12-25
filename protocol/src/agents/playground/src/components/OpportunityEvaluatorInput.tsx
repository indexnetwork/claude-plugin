import React from 'react';
import { X } from 'lucide-react';

interface OpportunityEvaluatorInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputMode: 'raw' | 'structured';
}

const safeParse = (str: string) => {
  try { return JSON.parse(str); } catch { return {}; }
};

// Editable profile form for source/candidates
const EditableProfile: React.FC<{
  profile: any;
  label: string;
  onUpdate: (newProfile: any) => void;
  onRemove: () => void;
}> = ({ profile, label, onUpdate, onRemove }) => {
  const identity = profile?.identity || {};
  const attributes = profile?.attributes || {};

  const updateField = (section: string, field: string, value: any) => {
    const newProfile = {
      ...profile,
      [section]: { ...(profile?.[section] || {}), [field]: value }
    };
    onUpdate(newProfile);
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid #333',
      borderRadius: '4px',
      padding: '12px',
      boxSizing: 'border-box'
    }}>
      {/* Header with label and remove */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: '#00ffff', fontSize: '0.8rem', fontWeight: 500 }}>{label}</span>
        <button
          onClick={onRemove}
          style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Identity */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
        <input
          type="text"
          value={identity.name || ''}
          onChange={(e) => updateField('identity', 'name', e.target.value)}
          placeholder="Name..."
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '4px 0', outline: 'none', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
        />
        <input
          type="text"
          value={identity.location || ''}
          onChange={(e) => updateField('identity', 'location', e.target.value)}
          placeholder="Location..."
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '4px 0', outline: 'none', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' }}
        />
        <textarea
          value={identity.bio || ''}
          onChange={(e) => updateField('identity', 'bio', e.target.value)}
          placeholder="Bio..."
          style={{ width: '100%', minHeight: '40px', background: 'rgba(255,255,255,0.02)', border: '1px dashed #333', color: '#e6e6e6', padding: '6px', resize: 'vertical', outline: 'none', fontFamily: 'monospace', fontSize: '0.8rem', boxSizing: 'border-box' }}
        />
      </div>

      {/* Interests & Skills */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <input
          type="text"
          value={(attributes.interests || []).join(', ')}
          onChange={(e) => {
            const interests = e.target.value.split(',').map(s => s.trim()).filter(s => s);
            updateField('attributes', 'interests', interests);
          }}
          placeholder="Interests (comma-separated)..."
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '4px 0', outline: 'none', fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }}
        />
        <input
          type="text"
          value={(attributes.skills || []).join(', ')}
          onChange={(e) => {
            const skills = e.target.value.split(',').map(s => s.trim()).filter(s => s);
            updateField('attributes', 'skills', skills);
          }}
          placeholder="Skills (comma-separated)..."
          style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '4px 0', outline: 'none', fontSize: '0.8rem', width: '100%', boxSizing: 'border-box' }}
        />
      </div>
    </div>
  );
};

export const OpportunityEvaluatorInput: React.FC<OpportunityEvaluatorInputProps> = ({
  inputVal,
  setInputVal,
  inputMode
}) => {
  // RAW mode - falls through to default textarea (handled by parent)
  if (inputMode === 'raw') {
    return null;
  }

  // STRUCT mode - form with sourceProfile, candidates, hydeDescription, minScore
  const parsed = safeParse(inputVal);
  const sourceProfile = parsed?.sourceProfile || null;
  const candidates = parsed?.candidates || [];
  const options = parsed?.options || {};
  const hydeDescription = options?.hydeDescription || '';
  const minScore = options?.minScore ?? 70;

  const updateInput = (updates: any) => {
    const newVal = { ...parsed, ...updates };
    setInputVal(JSON.stringify(newVal, null, 2));
  };

  const updateOptions = (optUpdates: any) => {
    updateInput({ options: { ...options, ...optUpdates } });
  };

  const removeCandidate = (index: number) => {
    const newCandidates = [...candidates];
    newCandidates.splice(index, 1);
    updateInput({ candidates: newCandidates });
  };

  const updateCandidate = (index: number, newProfile: any) => {
    const newCandidates = [...candidates];
    newCandidates[index] = newProfile;
    updateInput({ candidates: newCandidates });
  };

  const hasSource = sourceProfile?.identity;
  const hasCandidates = candidates.length > 0;

  return (
    <div className="complex-form structured-mode" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%', overflow: 'hidden' }}>

      {/* Source Profile Section */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px' }}>
            <label style={{ color: '#00ffff' }}>Source Profile</label>
            <span className="desc-tooltip">The user looking for opportunities</span>
          </div>
          <div className="input-col" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            {hasSource ? (
              <EditableProfile
                profile={sourceProfile}
                label="SOURCE"
                onUpdate={(p) => updateInput({ sourceProfile: p })}
                onRemove={() => updateInput({ sourceProfile: null })}
              />
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed #333',
                borderRadius: '4px',
                padding: '16px',
                textAlign: 'center',
                color: '#666',
                fontSize: '0.85rem'
              }}>
                Click a <span style={{ color: '#00ffff' }}>profile</span> → "Set as Source"
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Candidates Section */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px' }}>
            <label style={{ color: '#00ffff' }}>Candidates</label>
            <span className="desc-tooltip">Profiles to evaluate against the source</span>
          </div>
          <div className="input-col" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {hasCandidates ? (
              candidates.map((c: any, i: number) => (
                <EditableProfile
                  key={i}
                  profile={c}
                  label={`CANDIDATE #${i + 1}`}
                  onUpdate={(p) => updateCandidate(i, p)}
                  onRemove={() => removeCandidate(i)}
                />
              ))
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed #333',
                borderRadius: '4px',
                padding: '16px',
                textAlign: 'center',
                color: '#666',
                fontSize: '0.85rem'
              }}>
                Click a <span style={{ color: '#00ffff' }}>profile</span> → "Add to Candidates"
              </div>
            )}
          </div>
        </div>
      </div>

      {/* HyDE Description Section */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px' }}>
            <label style={{ color: '#00ffff' }}>HyDE Description</label>
            <span className="desc-tooltip">Hypothetical ideal match description (optional)</span>
          </div>
          <div className="input-col" style={{ width: '100%' }}>
            {hydeDescription ? (
              <div style={{ position: 'relative' }}>
                <textarea
                  value={hydeDescription}
                  onChange={(e) => updateOptions({ hydeDescription: e.target.value })}
                  style={{
                    width: '100%',
                    minHeight: '80px',
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#e6e6e6',
                    padding: '10px',
                    resize: 'vertical',
                    outline: 'none',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem'
                  }}
                />
                <button
                  onClick={() => updateOptions({ hydeDescription: '' })}
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    background: 'transparent',
                    border: 'none',
                    color: '#666',
                    cursor: 'pointer',
                    padding: '2px'
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed #333',
                borderRadius: '4px',
                padding: '16px',
                textAlign: 'center',
                color: '#666',
                fontSize: '0.85rem'
              }}>
                Click a <span style={{ color: '#00ffff' }}>hyde</span> from Context Memory to load it
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Minimum Score Slider */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <label style={{ color: '#00ffff' }}>Minimum Score</label>
              <span className="desc-tooltip">Filter opportunities below this score</span>
            </div>
            <span style={{ color: '#e6e6e6', fontFamily: 'monospace', fontSize: '0.9rem' }}>{minScore}</span>
          </div>
          <div className="input-col" style={{ width: '100%' }}>
            <input
              type="range"
              min={0}
              max={100}
              value={minScore}
              onChange={(e) => updateOptions({ minScore: parseInt(e.target.value) })}
              style={{
                width: '100%',
                accentColor: '#00ffff',
                cursor: 'pointer'
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpportunityEvaluatorInput;
