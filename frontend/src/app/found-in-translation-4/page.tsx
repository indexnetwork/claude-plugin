'use client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

// ── Found in Translation -4: Vintage Tech Magazine ──────────────
// Inspired by BYTE Magazine, INPUT, TIME "Computer Society" cover,
// Heathkit & early computing ads. Column-based newspaper layout,
// halftone textures, bold display headlines, green CRT screen mockups,
// retro-futurist editorial design circa 1978–1985.

const KF = `
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes scanline {
    0% { top: -20%; }
    100% { top: 110%; }
  }
  @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  @keyframes flash { 0%,100%{opacity:1} 10%,30%,50%,70%,90%{opacity:0.7} }
`;

// Palette: vintage print
const C = {
  paper:   '#f5efe2',     // aged newsprint
  cream:   '#faf5e8',
  ink:     '#1a1208',     // rich black print
  mid:     '#4a3d28',
  light:   '#8a7a5a',
  rule:    '#c8b888',     // column rules
  red:     '#c8281a',     // hot red — "computer society"
  green:   '#22aa44',     // phosphor green
  darkGreen: '#0a2010',   // screen background
  amber:   '#d4880a',     // amber accent
  blue:    '#1a3a8a',     // deep editorial blue
  halftone:'rgba(26,18,8,0.06)',
} as const;

const SLAB   = "'Georgia', 'Times New Roman', Times, serif";
const SYSTEM = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO   = "'Courier New', Courier, monospace";

function useScrollProgress() {
  const [p, setP] = useState(0);
  useEffect(() => {
    const h = () => {
      const d = document.documentElement;
      setP(d.scrollTop / (d.scrollHeight - d.clientHeight));
    };
    addEventListener('scroll', h, { passive: true });
    return () => removeEventListener('scroll', h);
  }, []);
  return p;
}

function useFadeIn(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!ref.current) return;
    const els = ref.current.querySelectorAll<HTMLElement>('[data-fade]');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${el.dataset.delay ?? 0}ms`;
          el.style.opacity = '1';
          el.style.transform = 'none';
        }),
      { threshold: 0.06 },
    );
    els.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      el.style.transition = 'opacity .7s ease, transform .7s ease';
      io.observe(el);
    });
    return () => io.disconnect();
  }, [ref]);
}

// CRT screen with phosphor glow
function CRTScreen({ content }: { content: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.darkGreen,
        borderRadius: 4,
        padding: '1.25rem 1.5rem',
        fontFamily: MONO,
        fontSize: '0.7rem',
        color: C.green,
        lineHeight: 1.8,
        position: 'relative',
        overflow: 'hidden',
        boxShadow: `inset 0 0 30px rgba(0,0,0,0.5), 0 0 0 2px #0a1a0a`,
      }}
    >
      {/* Scanline effect */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          height: '20%',
          background: 'linear-gradient(transparent, rgba(34,170,68,0.06), transparent)',
          animation: 'scanline 3s linear infinite',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />
      {/* Horizontal scanlines */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      <div style={{ position: 'relative', zIndex: 3 }}>
        {content}
      </div>
    </div>
  );
}

// Old computer terminal monitor frame
function TerminalMockup({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div data-fade style={{ margin: '2.5rem 0' }}>
      {/* Monitor outer shell */}
      <div
        style={{
          background: '#c8c4b8',
          borderRadius: '6px 6px 2px 2px',
          padding: '0.75rem 0.75rem 0.5rem',
          border: '2px solid #a0a098',
          boxShadow: '2px 4px 12px rgba(0,0,0,0.2)',
        }}
      >
        {/* Screen area */}
        <CRTScreen
          content={
            <>
              <div style={{ marginBottom: '0.75rem', color: 'rgba(34,170,68,0.5)', fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                {title}
              </div>
              {lines.map((line, i) => (
                <div key={i}>
                  {line === '__cursor__'
                    ? <span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
                    : <span dangerouslySetInnerHTML={{ __html: line }} />
                  }
                </div>
              ))}
            </>
          }
        />
        {/* Below screen */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0 0.25rem', gap: '0.5rem' }}>
          <div style={{ width: 40, height: 6, background: '#a0a098', borderRadius: 2 }} />
        </div>
      </div>
      {/* Monitor neck + base */}
      <div style={{ height: 16, background: '#b8b4a8', border: '2px solid #a0a098', borderTop: 'none', borderRadius: '0 0 2px 2px' }} />
      <div style={{ height: 8, background: '#a0a098', borderRadius: '0 0 4px 4px', margin: '0 10%' }} />
    </div>
  );
}

// Magazine pull quote — red rule style
function MagQuote({ text, attribution }: { text: string; attribution?: string }) {
  return (
    <div
      data-fade
      style={{
        margin: '3rem 0',
        borderTop: `4px solid ${C.red}`,
        borderBottom: `4px solid ${C.red}`,
        padding: '1.5rem 0',
      }}
    >
      <blockquote
        style={{
          fontFamily: SLAB,
          fontSize: 'clamp(1.05rem, 2vw, 1.3rem)',
          fontStyle: 'italic',
          lineHeight: 1.6,
          color: C.ink,
          margin: '0 0 0.75rem',
        }}
      >
        {text}
      </blockquote>
      {attribution && (
        <cite
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.65rem',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: C.light,
            fontStyle: 'normal',
          }}
        >
          — {attribution}
        </cite>
      )}
    </div>
  );
}

// Magazine section header — classic editorial
function MagSection({ n, label, kicker }: { n: string; label: string; kicker?: string }) {
  return (
    <div data-fade style={{ marginBottom: '2.5rem' }}>
      {kicker && (
        <div
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.6rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: C.red,
            marginBottom: '0.5rem',
          }}
        >
          {kicker}
        </div>
      )}
      <div style={{ height: 3, background: C.ink, marginBottom: '0.75rem' }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '1rem',
          marginBottom: '0.5rem',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: '0.6rem',
            color: C.light,
            letterSpacing: '0.1em',
          }}
        >
          §{n}
        </span>
        <h2
          style={{
            fontFamily: SLAB,
            fontWeight: 700,
            fontSize: 'clamp(1.4rem, 3vw, 2.2rem)',
            lineHeight: 1,
            color: C.ink,
            margin: 0,
          }}
        >
          {label}
        </h2>
      </div>
      <div style={{ height: 1, background: C.rule }} />
    </div>
  );
}

// Halftone-dot callout
function MagCallout({ children, bg = C.ink }: { children: React.ReactNode; bg?: string }) {
  return (
    <div
      data-fade
      style={{
        margin: '3.5rem 0',
        background: bg,
        padding: '2.5rem 3rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Halftone dot grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '12px 12px',
          pointerEvents: 'none',
        }}
      />
      <p
        style={{
          fontFamily: SLAB,
          fontSize: 'clamp(1.2rem, 2.8vw, 2rem)',
          fontStyle: 'italic',
          lineHeight: 1.25,
          color: bg === C.ink ? C.cream : C.ink,
          margin: 0,
          position: 'relative',
        }}
      >
        {children}
      </p>
    </div>
  );
}

// Image placeholder — vintage editorial style
function MagFigure({ caption, ratio = '16/9', label }: { caption: string; ratio?: string; label?: string }) {
  return (
    <figure
      data-fade
      style={{
        margin: '2.5rem 0',
        background: C.paper,
        border: `1px solid ${C.rule}`,
        aspectRatio: ratio,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Halftone dot background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(26,18,8,0.08) 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >
        <p
          style={{
            fontFamily: SLAB,
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: C.mid,
            textAlign: 'center',
            maxWidth: '36ch',
            lineHeight: 1.5,
            margin: 0,
            background: C.cream,
            padding: '0.5rem 1rem',
          }}
        >
          {caption}
        </p>
      </div>
      {label && (
        <figcaption
          style={{
            position: 'absolute',
            bottom: '0.6rem',
            right: '0.75rem',
            fontFamily: MONO,
            fontSize: '0.52rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.light,
          }}
        >
          {label}
        </figcaption>
      )}
    </figure>
  );
}

const FLOW = [
  { t: 'A human expresses intent',            d: 'Raw, unfiltered — in their own language' },
  { t: 'Their agent encodes it',              d: 'Context, nuance, and goals preserved' },
  { t: 'Agents discover overlapping intents', d: 'Scanning the network continuously, quietly' },
  { t: 'They negotiate compatibility',         d: 'Silent, tireless, on your behalf' },
  { t: 'They disclose appropriately',          d: 'Availability, context, relevant files — shared selectively' },
  { t: 'They consult memory and peers',        d: 'Gossip, reputation, trust signals weighed' },
  { t: 'An opportunity becomes legible',       d: 'Intent, context, trust, and timing finally align' },
  { t: 'Humans are invited in',                d: 'The door opens at the right moment' },
  { t: 'Humans decide: go or no-go',           d: 'The final say is always yours' },
  { t: 'If go, conversation initiated',        d: 'A new connection begins' },
];

const TICK = 'LANGUAGE IS THE NEW INTERFACE · AMBIENT OPTIMISM · AGENT-TO-AGENT · ENGINEERING SERENDIPITY · FOUND IN TRANSLATION · ';

export default function FoundInTranslation4() {
  const pageRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress();
  useFadeIn(pageRef as React.RefObject<HTMLElement>);

  const P: React.CSSProperties = {
    fontFamily: SLAB,
    fontSize: '1rem',
    lineHeight: 1.85,
    color: C.mid,
    marginBottom: '1.5rem',
  };

  const WRAP: React.CSSProperties = {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 2rem',
  };

  return (
    <div
      ref={pageRef}
      style={{
        background: C.paper,
        color: C.ink,
        minHeight: '100vh',
        overflowX: 'hidden',
        backgroundImage: 'radial-gradient(circle, rgba(26,18,8,0.025) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <style>{KF}</style>

      {/* Progress */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 100,
          background: C.rule,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: C.red,
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* ══ MASTHEAD / HERO ══ */}
      <section
        style={{
          background: C.ink,
          padding: 'clamp(3rem, 6vw, 5rem) 0 0',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Halftone texture */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '10px 10px',
            pointerEvents: 'none',
          }}
        />

        <div style={{ padding: '0 3rem', position: 'relative' }}>
          {/* Date/issue line */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderBottom: `1px solid rgba(255,255,255,0.15)`,
              paddingBottom: '0.75rem',
              marginBottom: '1.5rem',
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
              <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>Index Network</Link>
            </span>
            <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
              Vol. 1 · Protocol Series
            </span>
            <span style={{ fontFamily: MONO, fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>
              Language &amp; Intent
            </span>
          </div>

          {/* BIG red "FOUND IN" */}
          <div
            style={{
              display: 'inline-block',
              background: C.red,
              padding: '0.25rem 0.75rem',
              marginBottom: '0.5rem',
            }}
          >
            <span
              style={{
                fontFamily: SYSTEM,
                fontWeight: 700,
                fontSize: 'clamp(0.8rem, 1.8vw, 1.1rem)',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: C.cream,
              }}
            >
              FOUND IN
            </span>
          </div>

          <h1
            style={{
              fontFamily: SLAB,
              fontWeight: 700,
              fontSize: 'clamp(5rem, 16vw, 15rem)',
              lineHeight: 0.85,
              color: C.cream,
              margin: '0 0 0.5rem',
              letterSpacing: '-0.02em',
            }}
          >
            TRANS
            <br />
            LATION
          </h1>

          {/* Deck / sub-headline */}
          <div
            style={{
              borderTop: `3px double rgba(255,255,255,0.2)`,
              borderBottom: `3px double rgba(255,255,255,0.2)`,
              padding: '1rem 0',
              margin: '1.5rem 0 0',
              display: 'grid',
              gridTemplateColumns: '1fr 280px',
              gap: '2rem',
            }}
          >
            <p
              style={{
                fontFamily: SLAB,
                fontSize: 'clamp(0.9rem, 1.6vw, 1.1rem)',
                fontStyle: 'italic',
                lineHeight: 1.55,
                color: 'rgba(240,229,200,0.7)',
                margin: 0,
              }}
            >
              An inquiry into language, intent, and the infrastructure that might finally let the right things find each other. Some things find you. Most don't. This is about changing that.
            </p>
            {/* CRT screen teaser */}
            <CRTScreen
              content={
                <div>
                  <div style={{ color: 'rgba(34,170,68,0.5)', marginBottom: '0.5rem' }}>PROTOCOL v1.0</div>
                  <div>INTENT: ACTIVE</div>
                  <div>AGENTS: ONLINE</div>
                  <div>STATUS: SEARCHING</div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
                  </div>
                </div>
              }
            />
          </div>
        </div>

        {/* Scrolling ticker */}
        <div
          style={{
            marginTop: '2rem',
            background: C.red,
            padding: '0.4rem 0',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', whiteSpace: 'nowrap', animation: 'ticker 28s linear infinite' }}>
            {[0, 1].map((k) => (
              <span
                key={k}
                style={{
                  fontFamily: MONO,
                  fontSize: '0.58rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.9)',
                  paddingRight: '2em',
                }}
              >
                {TICK}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ══ SECTION 01 ══ */}
      <div style={{ ...WRAP, padding: '5rem 2rem 4rem' }}>
        <MagSection n="01" label="The Conversation" kicker="Language · Opportunity · Discovery" />

        <p
          data-fade
          style={{
            ...P,
            fontSize: 'clamp(1.1rem, 2.2vw, 1.4rem)',
            color: C.ink,
            lineHeight: 1.55,
            marginBottom: '2.5rem',
          }}
        >
          They get archived away in secret conversations, thoughts expressed as free agents between a second margarita with a coworker on a sunny patio—where language flows as naturally as it gets.
        </p>

        <MagFigure
          caption='Abstract image of two people talking — "i have this idea, is it crazy?"'
          label="Fig. 01"
        />

        <p data-fade style={P}>
          You sleep on your idea, wake up and start searching for someone who might just share your flavor of weird.
        </p>

        <MagFigure
          caption="Scrolling through endless pages of connections — a sense of irony and futility"
          ratio="21/6"
          label="Fig. 02"
        />

        <p data-fade style={P}>
          You would think it gets easier—that technology was meant to help the stars align and deliver us the job that doesn't exist yet, or the investor who gets it.
        </p>
        <p data-fade style={P}>
          For most of computing history, there was no system elastic enough to hold that kind of ambiguity. The next opportunity ahead is often illegible to ourselves—until it arrives as the email we've been waiting for.
        </p>
      </div>

      {/* Full-bleed CRT break */}
      <div
        style={{
          background: C.darkGreen,
          padding: 'clamp(5rem, 10vw, 10rem) 3rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 3px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '30%',
            background: 'linear-gradient(transparent, rgba(34,170,68,0.04), transparent)',
            animation: 'scanline 4s linear infinite',
          }}
        />
        <div style={{ position: 'relative', maxWidth: 720, margin: '0 auto' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              color: 'rgba(34,170,68,0.4)',
              marginBottom: '2rem',
            }}
          >
            SYSTEM STATUS: LOST IN TRANSLATION
          </div>
          <h2
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(1.8rem, 5vw, 4.5rem)',
              lineHeight: 1.1,
              color: C.green,
              margin: 0,
            }}
          >
            Somewhere along the way,
            <br />
            we got lost in translation.
          </h2>
          <div
            style={{
              marginTop: '2rem',
              fontFamily: MONO,
              fontSize: '0.75rem',
              color: 'rgba(34,170,68,0.5)',
            }}
          >
            <span style={{ animation: 'blink 1.5s step-end infinite' }}>█</span>
            {' '}intent never fully survived the handoff
          </div>
        </div>
      </div>

      {/* ══ SECTION 02 ══ */}
      <div style={{ ...WRAP, padding: '5rem 2rem 4rem' }}>
        <MagSection n="02" label="The Two Systems" kicker="Neuroscience · Decision-Making · Intent" />

        <p data-fade style={P}>It starts with the center of how we make sense of things: the brain.</p>

        {/* Two-column concept layout */}
        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            margin: '2.5rem 0',
            border: `1px solid ${C.rule}`,
          }}
        >
          {[
            {
              label: 'Habitual',
              sub: 'System I · Reactive',
              body: 'Reflexes, patterns, snooze buttons. What you did.',
              bg: C.paper,
              accent: C.mid,
            },
            {
              label: 'Intentional',
              sub: 'System II · Planning',
              body: 'Goals, models, long-game thinking. What you meant.',
              bg: C.cream,
              accent: C.amber,
            },
          ].map(({ label, sub, body, bg, accent }, i) => (
            <div
              key={label}
              style={{
                padding: '1.75rem',
                background: bg,
                borderLeft: i === 1 ? `1px solid ${C.rule}` : undefined,
              }}
            >
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: '0.55rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: accent,
                  marginBottom: '0.75rem',
                }}
              >
                {sub}
              </div>
              <div
                style={{
                  fontFamily: SLAB,
                  fontWeight: 700,
                  fontSize: 'clamp(1.4rem, 2.8vw, 2rem)',
                  lineHeight: 1,
                  color: C.ink,
                  marginBottom: '0.75rem',
                }}
              >
                {label}
              </div>
              <p style={{ fontFamily: SLAB, fontSize: '0.88rem', color: C.mid, lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
                {body}
              </p>
            </div>
          ))}
        </div>

        <p data-fade style={P}>
          Most of what we call "intent" lives in the second system—context-sensitive and continuously recalibrating to our desired outcomes.
        </p>

        <MagQuote
          text='"When we say that meanings materialize, we mean that sensemaking is, importantly, an issue of language, talk, and communication. Situations, organizations, and environments are talked into existence."'
          attribution="Andrew Hinton, Understanding Context (2014)"
        />

        <MagCallout>
          Computers do not operate on raw human intent,<br />only its translation.
        </MagCallout>

        {/* CLI vs GUI as terminal mockups */}
        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            margin: '2.5rem 0',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: '0.55rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: C.light,
                marginBottom: '0.5rem',
              }}
            >
              Command Line Era
            </div>
            <TerminalMockup
              title="UNIX v7 · 1979"
              lines={[
                '$ find_job --role "engineer"',
                'Searching... 2,847 results',
                '$ filter --skill "rust"',
                'Filtered to 12 results',
                '$ apply --cv resume.pdf',
                'Sending application...',
                '__cursor__',
              ]}
            />
            <p style={{ ...P, fontSize: '0.8rem' }}>
              Explicit and exacting. Hard work most of us don't have energy for.
            </p>
          </div>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: '0.55rem',
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: C.light,
                marginBottom: '0.5rem',
              }}
            >
              GUI Era
            </div>
            <div
              data-fade
              style={{ margin: '0 0 2.5rem' }}
            >
              <div
                style={{
                  background: '#c8d4d4',
                  borderRadius: '4px 4px 2px 2px',
                  padding: '0.4rem',
                  border: '2px solid #a0b0b0',
                }}
              >
                <div style={{ background: '#b0bebe', borderRadius: 2, padding: '0.3rem 0.4rem', display: 'flex', gap: '0.25rem', alignItems: 'center', marginBottom: 4 }}>
                  {['#cc5050','#c8a030','#50a050'].map((c, i) => (
                    <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
                  ))}
                  <div style={{ flex: 1, height: 12, background: '#a0b0b0', borderRadius: 2, marginLeft: 4 }} />
                </div>
                <div style={{ background: '#e8f0f0', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {['100%','70%','45%'].map((w, i) => (
                    <div key={i} style={{ height: 11, background: '#b0c4c4', borderRadius: 1, width: w }} />
                  ))}
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {[0,1,2,3].map(i => (
                      <div key={i} style={{ width: 30, height: 30, background: '#98b0b0', borderRadius: 3 }} />
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ height: 10, background: '#b0bebe', border: '2px solid #a0b0b0', borderTop: 'none' }} />
            </div>
            <p style={{ ...P, fontSize: '0.8rem' }}>
              Easier to use, but increased the distance between intent and execution.
            </p>
          </div>
        </div>
      </div>

      {/* Editorial break — amber */}
      <div
        style={{
          background: C.amber,
          padding: 'clamp(4rem, 8vw, 8rem) 3rem',
          textAlign: 'center',
          borderTop: `1px solid rgba(0,0,0,0.15)`,
          borderBottom: `1px solid rgba(0,0,0,0.15)`,
        }}
      >
        <p
          style={{
            fontFamily: SLAB,
            fontWeight: 700,
            fontSize: 'clamp(1.5rem, 4.5vw, 4rem)',
            lineHeight: 1.15,
            color: C.cream,
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          Translation at its best is still reductive.
          <br />
          <em>But what if translation could carry the original intent?</em>
        </p>
      </div>

      {/* ══ SECTION 03 ══ */}
      <div style={{ ...WRAP, padding: '5rem 2rem 4rem' }}>
        <MagSection n="03" label="Language as Interface" kicker="LLMs · Agents · The New Substrate" />

        <h2
          data-fade
          style={{
            fontFamily: SLAB,
            fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3.2rem)',
            lineHeight: 1.1,
            color: C.ink,
            marginBottom: '2.5rem',
          }}
        >
          Language is the <span style={{ color: C.red }}>new interface.</span>
        </h2>

        <p data-fade style={P}>
          Instead of searching through platforms and engines, we're talking to LLMs. The translation tax that defined prior interfaces is slowly collapsing. We can feel it every time we send a stream of consciousness voice memo to an AI and make it interpret us instead of the other way around.
        </p>

        <MagFigure
          caption="The next intent lives inside the search — Google vs. index visual"
          ratio="16/6"
          label="Fig. 03"
        />

        <p data-fade style={P}>
          For the first time, systems can engage with the model-based, context-sensitive layer of human decision-making: the layer where intent actually lives.
        </p>

        <MagCallout bg={C.blue}>
          "Have your agent call my agent."
        </MagCallout>

        <p data-fade style={P}>
          It's not about a better matching algorithm, but redesigning the way we think about finding our others. Because sometimes new opportunity needs privacy before visibility. A place to putter around before parading itself on external platforms.
        </p>
        <p data-fade style={P}>
          Agents congregate in their own social networks and water coolers to trade gossip on behalf of their users—strategic cooperation as end goal.
        </p>
      </div>

      {/* ══ SECTION 04: Protocol ══ */}
      <div
        style={{
          background: C.cream,
          padding: 'clamp(5rem, 8vw, 8rem) 2rem',
          borderTop: `1px solid ${C.rule}`,
          borderBottom: `1px solid ${C.rule}`,
        }}
      >
        <div style={{ ...WRAP }}>
          <MagSection n="04" label="The Protocol" kicker="Coordination · Trust · The Social Model" />

          <h2
            data-fade
            style={{
              fontFamily: SLAB,
              fontWeight: 700,
              fontSize: 'clamp(1.6rem, 3.5vw, 2.8rem)',
              lineHeight: 1.1,
              color: C.ink,
              marginBottom: '3rem',
            }}
          >
            The emerging model of <span style={{ color: C.green }}>social coordination.</span>
          </h2>

          {/* Flow — numbered magazine list */}
          <div style={{ margin: '2rem 0' }}>
            {FLOW.map((step, i) => (
              <div
                data-fade
                data-delay={String(i * 40)}
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '3rem 1fr',
                  gap: '1rem',
                  padding: '0.85rem 0',
                  borderBottom: `1px solid ${C.rule}`,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    color: C.amber,
                    paddingTop: '0.25rem',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}.
                </div>
                <div>
                  <div style={{ fontFamily: SLAB, fontWeight: 700, fontSize: '0.95rem', color: C.ink, marginBottom: '0.2rem' }}>
                    {step.t}
                  </div>
                  <p style={{ fontFamily: SLAB, fontSize: '0.8rem', fontStyle: 'italic', color: C.light, lineHeight: 1.5, margin: 0 }}>
                    {step.d}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p data-fade style={{ ...P, marginTop: '2rem' }}>
            The human sets the initial judgment and still has the final say. Agents are autonomous in facilitating, not deciding.
          </p>

          <MagQuote
            text="It's more than training a better model. It's an operating protocol for cooperation—standard procedures for agent-to-agent relationships that let trust compound over time."
          />
        </div>
      </div>

      {/* ══ SECTION 05 ══ */}
      <div style={{ ...WRAP, padding: '5rem 2rem 6rem' }}>
        <MagSection n="05" label="Ambient Optimism" kicker="Serendipity · Engineering · The Future" />

        <h2
          data-fade
          style={{
            fontFamily: SLAB,
            fontWeight: 700,
            fontSize: 'clamp(1.8rem, 4vw, 3.2rem)',
            lineHeight: 1.1,
            color: C.ink,
            marginBottom: '2.5rem',
          }}
        >
          Entering ambient optimism.
        </h2>

        <p data-fade style={P}>
          We can now realize opportunity value that previously remained latent because of lack of—or failed—coordination. Open up multiverses where you meet the person you just missed.
        </p>
        <p data-fade style={P}>
          We call this <strong style={{ fontWeight: 700 }}>engineering serendipity</strong>. But the feeling it engenders is the powerful part:
        </p>

        <div
          data-fade
          style={{
            margin: '3rem 0',
            padding: '2.5rem 3rem',
            background: C.cream,
            borderLeft: `4px solid ${C.amber}`,
            borderRight: `4px solid ${C.amber}`,
            textAlign: 'center',
          }}
        >
          <p
            style={{
              fontFamily: SLAB,
              fontSize: 'clamp(1.2rem, 2.8vw, 1.8rem)',
              fontStyle: 'italic',
              color: C.ink,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Ambient optimism. The quiet trust that the right opportunities will find you.
          </p>
        </div>

        <p data-fade style={P}>
          Not because you finally nailed your personal brand or figured out the black box algos, but because your intents are out there—the new trading language of agents with far more patience and reach to find the right match.
        </p>
      </div>

      {/* ══ CLOSING ══ */}
      <div
        style={{
          background: C.ink,
          padding: 'clamp(6rem, 12vw, 12rem) 3rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '12px 12px',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '0.55rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'rgba(240,229,200,0.3)',
              marginBottom: '3rem',
            }}
          >
            — Found in Translation
          </div>
          <p
            style={{
              fontFamily: SLAB,
              fontWeight: 700,
              fontSize: 'clamp(2.5rem, 8vw, 7rem)',
              lineHeight: 1.05,
              color: C.cream,
              margin: 0,
            }}
          >
            Your others
            <br />
            are out there.
            <br />
            <em style={{ color: C.amber }}>
              Now they can
              <br />
              find you too.
            </em>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '2rem 2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: C.paper,
          borderTop: `3px solid ${C.ink}`,
        }}
      >
        <Link to="/" style={{ fontFamily: MONO, fontSize: '0.7rem', color: C.mid, textDecoration: 'none', letterSpacing: '0.05em' }}>
          Index Network
        </Link>
        <Link to="/blog" style={{ fontFamily: MONO, fontSize: '0.7rem', color: C.light, textDecoration: 'none', letterSpacing: '0.05em' }}>
          ← Back to Letters
        </Link>
      </footer>
    </div>
  );
}
