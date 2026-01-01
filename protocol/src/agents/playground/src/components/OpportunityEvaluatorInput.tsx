import React from 'react';
import { GeneralInput } from './GeneralInput';
import { Search } from 'lucide-react';

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

  // STRUCT mode - 4 inputs
  const parsed = safeParse(inputVal);
  const sourceProfile = parsed?.sourceProfile || null;
  const candidates = parsed?.candidates || [];
  const options = parsed?.options || {};
  const hydeDescription = options?.hydeDescription || '';
  const minScore = options?.minScore || 70;

  const updateInput = (updates: any) => {
    const newVal = { ...parsed, ...updates };
    setInputVal(JSON.stringify(newVal, null, 2));
  };

  const updateOptions = (optUpdates: any) => {
    updateInput({ options: { ...options, ...optUpdates } });
  };

  /* Handlers */

  const handleEmbedSearch = async () => {
    // 1. Determine query text (HyDE Desc > Source Profile)
    let queryText = hydeDescription;
    if (!queryText && sourceProfile) {
      // Construct fallback text from profile
      const p = sourceProfile;
      const parts = [
        p.identity?.bio,
        p.narrative?.aspirations,
        p.narrative?.context,
        ...(p.attributes?.interests || []),
        ...(p.attributes?.skills || [])
      ];
      queryText = parts.filter(Boolean).join(' ');
      onLog?.('[EmbedSearch] Using Source Profile text (HyDE desc empty).');
    }

    if (!queryText) {
      alert('Cannot search: No HyDE Description or Source Profile text available.');
      return;
    }

    onLog?.('[EmbedSearch] Generating embedding for query...');

    try {
      // 2. Generate Embedding via API
      const response = await fetch('/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: queryText })
      });
      const data = await response.json();

      if (data.error) throw new Error(data.error);
      const queryVector = data.vector;

      if (!queryVector || !Array.isArray(queryVector)) {
        throw new Error('Invalid vector response');
      }

      onLog?.('[EmbedSearch] Searching context...');

      // 3. Filter candidates from context
      const potentialCandidates = context
        .filter(c => c.type === 'profile' || (c.type === 'generated' && c.data?.identity))
        .map(c => {
          const rawData = c.data || c.value;
          // unwrapping
          const profile = rawData?.profile || rawData;
          // embedding might be on wrapper or profile
          const embedding = rawData?.embedding || profile?.embedding;

          return { ...profile, embedding };
        })
        .filter(p => !sourceProfile || p.identity?.name !== sourceProfile.identity?.name) // Exclude self
        .filter(p => p.embedding && Array.isArray(p.embedding)); // Must have embedding

      if (potentialCandidates.length === 0) {
        onLog?.('[EmbedSearch] No candidates with embeddings found in context.');
        return;
      }

      // 4. Score
      const scored = potentialCandidates.map(p => ({
        profile: p,
        score: cosineSimilarity(queryVector, p.embedding)
      }));

      // 5. Sort
      scored.sort((a, b) => b.score - a.score);

      // 6. Update Input with top 10
      const topCandidates = scored.slice(0, 10).map(s => {
        // Should we strip embedding to save space? 
        // Registry Runner needs embeddings to re-score/filter if it does memory search.
        // But UI shows cleaner without it. 
        // Let's keep it but maybe UI hides it via json2md?
        // json2md.toMarkdown (table) will show all keys. Embedding key with huge array is bad.
        // We should strip embedding for clean UI, but Runner needs it?

        // Actually, Runner uses `memoryEmbedder` which mocks search.
        // If `candidates` are passed WITHOUT embeddings, memorySearcher fails (lines 36 checks `!item.embedding`).

        // So we MUST keep embeddings.
        // Ideally json2md should not render huge arrays?
        // json2md.ts changes treated `Array` -> List. 
        // Embedding is `number[]` (Array of Primitives) -> List.
        // A list of 1536 numbers in a table cell is terrible.

        // Hack: Strip embedding for UI, but maybe Runner re-calculates? No.
        // Or, maybe we hide it from UI input?

        // If we stringify candidates with embeddings into GeneralInput, the user sees huge JSON.
        // If we use JSON->MD, it tries to render table.

        // Let's assume user accepts huge JSON/MD for now, or we strip it and assume Runner handles it?
        // Runner checks `!item.embedding`. 
        // If we strip, Runner fails.

        // Unless we put embedding in a hidden field? No.

        // Solution: We keep embedding.
        // Maybe modify json2md to ignore `embedding` key?

        return s.profile;
      });

      updateInput({ candidates: topCandidates });
      onLog?.(`[EmbedSearch] Found ${topCandidates.length} candidates.`);

    } catch (e: any) {
      console.error(e);
      onLog?.(`[EmbedSearch] Error: ${e.message}`);
    }
  };

  return (
    <div className="complex-form structured-mode" style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflowY: 'auto', paddingRight: '8px' }}>

      {/* 1. Source Profile */}
      <div style={{ height: '300px', flexShrink: 0 }}>
        <GeneralInput
          label="SOURCE PROFILE"
          value={sourceProfile ? JSON.stringify(sourceProfile, null, 2) : ''}
          onChange={(val) => {
            try { updateInput({ sourceProfile: JSON.parse(val) }); }
            catch { /* Allow invalid JSON while typing? Or block? GeneralInput handles edits. We sync via Object. */
              // If we pass stringified object, GeneralInput 'value' changes. 
              // GeneralInput onChange returns STRING.
              // We try parse. If valid, update upstream.
              // If invalid, we can't update upstream OBJECT.
              // We need local state if we want to support editing JSON text.
              // But here I am implementing standard uncontrolled-like pattern via upstream.
              // If parse fails, upstream doesn't update, valid input reverts!
              // I need local state for each input.
            }
          }}
        // We need separate wrappers with local state if we want smooth editing.
        // Re-using the logic from IntentManagerInput/ExplicitInput
        // But I'll inline a wrapper helper.
        />
        {/* Helper function to avoid code dup? */}
      </div>

      {/* I will use a helper component 'JsonParamsInput' inside */}
      <JsonParamsInput
        label="SOURCE PROFILE"
        value={sourceProfile}
        onChange={(v) => updateInput({ sourceProfile: v })}
        height="250px"
      />

      <div style={{ height: '150px', flexShrink: 0 }}>
        <GeneralInput
          label="HYDE DESCRIPTION"
          value={hydeDescription}
          onChange={(val) => updateOptions({ hydeDescription: val })}
        />
      </div>

      <div style={{ height: '80px', flexShrink: 0 }}>
        {/* Min Score - treat as string/number */}
        <GeneralInput
          label="MIN SCORE"
          value={String(minScore)}
          onChange={(val) => updateOptions({ minScore: parseInt(val) || 0 })}
        />
      </div>

      <div style={{ height: '300px', flexShrink: 0 }}>
        <JsonParamsInput
          label="CANDIDATES"
          value={candidates}
          onChange={(v) => updateInput({ candidates: v })}
          height="100%"
          headerControls={
            <button
              onClick={handleEmbedSearch}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'rgba(0, 255, 255, 0.1)',
                border: '1px solid #00ffff',
                color: '#00ffff',
                padding: '4px 8px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              <Search size={14} /> Embed Search
            </button>
          }
        />
      </div>
    </div>
  );
};

// Helper for JSON/Object inputs (Source, Candidates) to handle valid/invalid states
const JsonParamsInput: React.FC<{
  label: string;
  value: any;
  onChange: (val: any) => void;
  height?: string;
  headerControls?: React.ReactNode;
}> = ({ label, value, onChange, height, headerControls }) => {
  const [str, setStr] = React.useState(value ? JSON.stringify(value, null, 2) : '');

  // Sync upstream -> local
  React.useEffect(() => {
    // If value changes externally (injection), update str
    // But avoid clobbering local edits.
    // Simple structural check
    try {
      const local = JSON.parse(str || 'null');
      if (JSON.stringify(local) !== JSON.stringify(value)) {
        setStr(value ? JSON.stringify(value, null, 2) : '');
      }
    } catch {
      // local invalid, if value changed significantly, overwrite? 
      // For injection, yes.
      // checking ref is better but let's trust stringify equality for now.
      if (value && JSON.stringify(value, null, 2) !== str) {
        setStr(JSON.stringify(value, null, 2));
      }
    }
  }, [value]);

  return (
    <div style={{ height: height || '100%', width: '100%' }}>
      <GeneralInput
        label={label}
        value={str}
        onChange={(val) => {
          setStr(val);
          try {
            const obj = JSON.parse(val);
            onChange(obj);
          } catch {
            // invalid json, don't update upstream yet
          }
        }}
        headerControls={headerControls}
        allowJson2Md={true}
        allowMarkdown={true}
      />
    </div>
  );
};
