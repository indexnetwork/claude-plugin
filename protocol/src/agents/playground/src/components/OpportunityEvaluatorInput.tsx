import React from 'react';
import { X } from 'lucide-react';

interface OpportunityEvaluatorInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputMode: 'raw' | 'structured';
  context: any[]; // Passed from App
  onLog?: (msg: string) => void;
}

const safeParse = (str: string) => {
  try { return JSON.parse(str); } catch { return {}; }
};

// --- Helper: Cosine Similarity ---
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

// Editable profile form for source/candidates
const EditableProfile: React.FC<{
  profile: any;
  label: string;
  onUpdate: (newProfile: any) => void;
  onRemove: () => void;
}> = ({ profile, label, onUpdate, onRemove }) => {
  const identity = profile?.identity || {};
  const attributes = profile?.attributes || {};
  // ... (rest of EditableProfile remains same, reusing existing code implicitly if I could, but here I'm replacing the top part so I need to be careful not to cut off EditableProfile if I used replace_file_content on a range. 
  // Wait, I am replacing lines 4-110. EditableProfile starts at line 15. The provided ReplacementContent MUST include EditableProfile or I must adjust the range.)

  // RE-INLINING EditableProfile to be safe since I am replacing the top block including imports/interfaces

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
  inputMode,
  context,
  onLog
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

  /* Candidates Section */

  const handleAutoDiscovery = () => {
    if (!sourceProfile) {
      console.warn('No source profile selected');
      return;
    }

    // 1. Get query vector from source
    // Ideally this is sourceProfile.embedding. If not present, we can't do vector search client side.
    // For now, assume it's there.
    const queryVector = sourceProfile.embedding;

    if (!queryVector || !Array.isArray(queryVector)) {
      console.warn('Source profile has no embedding vector. Cannot auto-discover.');
      alert('Source profile missing embedding. Please ensure it was generated/fetched with an embedding.');
      return;
    }

    // 2. Filter candidates from context
    const potentialCandidates = context
      .filter(c => c.type === 'profile' || (c.type === 'generated' && c.data?.identity))
      .map(c => {
        const data = c.data || c.value;
        // Check for wrapped format { profile: ..., embedding: ... }
        if (data?.profile) {
          return {
            ...data.profile,
            // Use embedding from wrapper if available, else check inside profile
            embedding: data.embedding || data.profile.embedding
          };
        }
        return data;
      })
      .filter(p => p && p.identity && p.identity.name !== sourceProfile.identity.name) // Simple name exclusion
      .filter(p => p.embedding && Array.isArray(p.embedding));

    console.log(`[AutoDiscover] Found ${potentialCandidates.length} eligible candidates in local context.`);

    // 3. Score
    const scored = potentialCandidates.map(p => ({
      profile: p,
      score: cosineSimilarity(queryVector, p.embedding)
    }));

    // 4. Sort and Log
    scored.sort((a, b) => b.score - a.score);

    console.log('[AutoDiscover] Scores:', scored.map(s => `${s.profile.identity.name}: ${s.score.toFixed(4)}`));

    console.log('[AutoDiscover] Top Candidates Selected:');
    onLog?.('[AutoDiscover] Top Candidates Selected:');

    scored.slice(0, 5).forEach((s, i) => {
      const msg = `  ${i + 1}. ${s.profile.identity.name} - Score: ${s.score.toFixed(4)}`;
      console.log(msg);
      onLog?.(msg);
    });

    // 5. Update Input with top 5
    const topCandidates = scored.slice(0, 5).map(s => s.profile);
    updateInput({ candidates: topCandidates });
  };

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
          <div className="label-col" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ color: '#00ffff' }}>Candidates</label>
              <span className="desc-tooltip">Profiles to evaluate against the source</span>
            </div>
            <button
              onClick={handleAutoDiscovery}
              style={{
                background: '#333',
                color: '#00ffff',
                border: '1px solid #00ffff',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Auto-Find
            </button>
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
                <br /><span style={{ opacity: 0.5, fontSize: '0.75rem' }}>or click Auto-Find to search local memory</span>
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
