import React from 'react';
import { X, Plus } from 'lucide-react';

interface IntentManagerInputProps {
  inputVal: string;
  setInputVal: (val: string) => void;
  inputMode: 'raw' | 'structured';
}

const safeParse = (str: string) => {
  try { return JSON.parse(str); } catch { return {}; }
};

// Editable profile form
const EditableProfile: React.FC<{
  profile: any;
  onUpdate: (newProfile: any) => void;
  onRemove: () => void;
}> = ({ profile, onUpdate, onRemove }) => {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ color: '#00ffff', fontSize: '0.8rem', fontWeight: 500 }}>PROFILE</span>
        <button
          onClick={onRemove}
          style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px' }}
        >
          <X size={14} />
        </button>
      </div>

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

// Single active intent with vertical layout
const ActiveIntentRow: React.FC<{
  intent: any;
  index: number;
  onUpdate: (i: number, updated: any) => void;
  onRemove: (i: number) => void;
}> = ({ intent, index, onUpdate, onRemove }) => {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid #333',
      borderRadius: '4px',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {/* Header with index and remove */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#00ffff', fontSize: '0.8rem', fontWeight: 500 }}>INTENT #{index + 1}</span>
        <button
          onClick={() => onRemove(index)}
          style={{ background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', padding: '2px' }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Description row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ color: '#888', fontSize: '0.7rem', textTransform: 'uppercase' }}>Description</label>
        <input
          type="text"
          value={intent.description || ''}
          onChange={(e) => onUpdate(index, { ...intent, description: e.target.value })}
          placeholder="What is this intent about..."
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid #444',
            color: '#e6e6e6',
            padding: '6px 0',
            outline: 'none',
            fontSize: '0.85rem',
            width: '100%'
          }}
        />
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <label style={{ color: '#888', fontSize: '0.7rem', textTransform: 'uppercase' }}>Status</label>
        <select
          value={intent.status || 'active'}
          onChange={(e) => onUpdate(index, { ...intent, status: e.target.value })}
          style={{
            background: '#1a1a1a',
            border: '1px solid #333',
            color: '#e6e6e6',
            padding: '6px 10px',
            borderRadius: '4px',
            fontSize: '0.85rem',
            cursor: 'pointer',
            width: 'fit-content'
          }}
        >
          <option value="active">active</option>
          <option value="completed">completed</option>
          <option value="expired">expired</option>
        </select>
      </div>
    </div>
  );
};

export const IntentManagerInput: React.FC<IntentManagerInputProps> = ({
  inputVal,
  setInputVal,
  inputMode
}) => {
  if (inputMode === 'raw') {
    return null;
  }

  const parsed = safeParse(inputVal);
  const content = parsed?.content || '';
  const profile = parsed?.profile || null;
  const activeIntents = parsed?.activeIntents || [];

  const updateInput = (updates: any) => {
    const newVal = { ...parsed, ...updates };
    setInputVal(JSON.stringify(newVal, null, 2));
  };

  const updateIntent = (index: number, updated: any) => {
    const newIntents = [...activeIntents];
    newIntents[index] = updated;
    updateInput({ activeIntents: newIntents });
  };

  const removeIntent = (index: number) => {
    const newIntents = [...activeIntents];
    newIntents.splice(index, 1);
    updateInput({ activeIntents: newIntents });
  };

  const addIntent = () => {
    const newIntent = {
      id: `intent-${Date.now()}`,
      description: '',
      status: 'active',
      created_at: Date.now()
    };
    updateInput({ activeIntents: [...activeIntents, newIntent] });
  };

  const hasProfile = profile?.identity;
  const hasIntents = activeIntents.length > 0;

  return (
    <div className="complex-form structured-mode" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '100%', overflow: 'hidden' }}>

      {/* Content Section */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px' }}>
            <label style={{ color: '#00ffff' }}>Content</label>
            <span className="desc-tooltip">New text input from user (e.g., message, note)</span>
          </div>
          <div className="input-col" style={{ width: '100%' }}>
            <textarea
              value={content}
              onChange={(e) => updateInput({ content: e.target.value })}
              placeholder="Enter text to analyze for intent changes..."
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
                fontSize: '0.85rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px' }}>
            <label style={{ color: '#00ffff' }}>Profile</label>
            <span className="desc-tooltip">User's memory profile for context</span>
          </div>
          <div className="input-col" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
            {hasProfile ? (
              <EditableProfile
                profile={profile}
                onUpdate={(p) => updateInput({ profile: p })}
                onRemove={() => updateInput({ profile: null })}
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
                Click a <span style={{ color: '#00ffff' }}>profile</span> from Context Memory
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Active Intents Section */}
      <div className="form-group">
        <div className="form-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <div className="label-col" style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <label style={{ color: '#00ffff' }}>Active Intents</label>
              <span className="desc-tooltip">Current intents to reconcile against</span>
            </div>
            <button
              onClick={addIntent}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#00ffff',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              <Plus size={12} /> Add
            </button>
          </div>
          <div className="input-col" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {hasIntents ? (
              activeIntents.map((intent: any, i: number) => (
                <ActiveIntentRow
                  key={intent.id || i}
                  intent={intent}
                  index={i}
                  onUpdate={updateIntent}
                  onRemove={removeIntent}
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
                No active intents. Click <span style={{ color: '#00ffff' }}>+ Add</span> or load from context.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntentManagerInput;
