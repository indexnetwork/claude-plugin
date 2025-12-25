import React from 'react';

interface HydeGeneratorInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputMode: 'raw' | 'structured';
}

const safeParse = (str: string) => {
  try { return JSON.parse(str); } catch { return {}; }
};

export const HydeGeneratorInput: React.FC<HydeGeneratorInputProps> = ({
  inputVal,
  setInputVal,
  inputMode
}) => {
  // RAW mode - falls through to default textarea (handled by parent)
  if (inputMode === 'raw') {
    return null; // Let parent handle raw mode
  }

  // STRUCT mode - editable UserMemoryProfile
  const parsed = safeParse(inputVal);
  const hasProfile = parsed?.identity || parsed?.profile?.identity;
  const profile = parsed?.profile || parsed;

  return (
    <div className="complex-form structured-mode">
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '12px' }}>
            <label style={{ color: '#00ffff' }}>UserMemoryProfile</label>
            <span className="desc-tooltip">Select a profile from Context Memory or edit below</span>
          </div>
          <div className="input-col" style={{ width: '100%' }}>
            {hasProfile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Identity Section */}
                <div style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: '12px' }}>
                  <div style={{ color: '#00ffff', fontSize: '0.85rem', marginBottom: '8px' }}>Identity</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="text"
                      value={profile.identity?.name || ''}
                      onChange={(e) => {
                        const newProfile = { ...profile, identity: { ...profile.identity, name: e.target.value } };
                        setInputVal(JSON.stringify(newProfile, null, 2));
                      }}
                      placeholder="Name..."
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '6px 0', outline: 'none', fontSize: '0.9rem' }}
                    />
                    <input
                      type="text"
                      value={profile.identity?.location || ''}
                      onChange={(e) => {
                        const newProfile = { ...profile, identity: { ...profile.identity, location: e.target.value } };
                        setInputVal(JSON.stringify(newProfile, null, 2));
                      }}
                      placeholder="Location..."
                      style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '6px 0', outline: 'none', fontSize: '0.9rem' }}
                    />
                    <textarea
                      value={profile.identity?.bio || ''}
                      onChange={(e) => {
                        const newProfile = { ...profile, identity: { ...profile.identity, bio: e.target.value } };
                        setInputVal(JSON.stringify(newProfile, null, 2));
                      }}
                      placeholder="Bio..."
                      style={{ width: '100%', minHeight: '60px', background: 'rgba(255,255,255,0.02)', border: '1px dashed #333', color: '#e6e6e6', padding: '8px', resize: 'vertical', outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                {/* Narrative Section */}
                <div style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: '12px' }}>
                  <div style={{ color: '#00ffff', fontSize: '0.85rem', marginBottom: '8px' }}>Narrative</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Context</div>
                      <textarea
                        value={profile.narrative?.context || ''}
                        onChange={(e) => {
                          const newProfile = { ...profile, narrative: { ...profile.narrative, context: e.target.value } };
                          setInputVal(JSON.stringify(newProfile, null, 2));
                        }}
                        placeholder="Describe their current situation, background..."
                        style={{ width: '100%', minHeight: '60px', background: 'rgba(255,255,255,0.02)', border: '1px dashed #333', color: '#e6e6e6', padding: '8px', resize: 'vertical', outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Aspirations</div>
                      <textarea
                        value={profile.narrative?.aspirations || ''}
                        onChange={(e) => {
                          const newProfile = { ...profile, narrative: { ...profile.narrative, aspirations: e.target.value } };
                          setInputVal(JSON.stringify(newProfile, null, 2));
                        }}
                        placeholder="Describe their goals, what they want to achieve..."
                        style={{ width: '100%', minHeight: '60px', background: 'rgba(255,255,255,0.02)', border: '1px dashed #333', color: '#e6e6e6', padding: '8px', resize: 'vertical', outline: 'none', fontFamily: 'monospace', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Attributes Section */}
                <div>
                  <div style={{ color: '#00ffff', fontSize: '0.85rem', marginBottom: '8px' }}>Attributes</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Interests (comma-separated)</div>
                      <input
                        type="text"
                        value={(profile.attributes?.interests || []).join(', ')}
                        onChange={(e) => {
                          const interests = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                          const newProfile = { ...profile, attributes: { ...profile.attributes, interests } };
                          setInputVal(JSON.stringify(newProfile, null, 2));
                        }}
                        placeholder="AI, Blockchain, Design..."
                        style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '6px 0', outline: 'none', fontSize: '0.9rem' }}
                      />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Skills (comma-separated)</div>
                      <input
                        type="text"
                        value={(profile.attributes?.skills || []).join(', ')}
                        onChange={(e) => {
                          const skills = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                          const newProfile = { ...profile, attributes: { ...profile.attributes, skills } };
                          setInputVal(JSON.stringify(newProfile, null, 2));
                        }}
                        placeholder="TypeScript, Python, ML..."
                        style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #333', color: '#e6e6e6', padding: '6px 0', outline: 'none', fontSize: '0.9rem' }}
                      />
                    </div>
                  </div>
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
                Click on a <span style={{ color: '#00ffff' }}>profile</span> from Context Memory to load it here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HydeGeneratorInput;
