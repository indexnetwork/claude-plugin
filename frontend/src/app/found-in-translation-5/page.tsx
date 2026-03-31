'use client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

// ── Found in Translation -5: Terminal / Green Phosphor ──────────
// Pure CRT terminal aesthetic: black background, phosphor green,
// monospace everything, scanlines, ASCII art borders, blinking cursors,
// typewriter text reveals, raster patterns, command-line poetry.
// Like reading the protocol through a VT100 in 1982.

const KF = `
  @keyframes blink {
    0%,49%  { opacity:1; }
    50%,100% { opacity:0; }
  }
  @keyframes scanline {
    0%   { top: -10%; }
    100% { top: 110%; }
  }
  @keyframes bootUp {
    from { opacity: 0; transform: scaleY(0.01); }
    to   { opacity: 1; transform: scaleY(1); }
  }
  @keyframes glowPulse {
    0%,100% { text-shadow: 0 0 4px #22dd44, 0 0 8px rgba(34,200,68,0.4); }
    50%     { text-shadow: 0 0 8px #22dd44, 0 0 20px rgba(34,200,68,0.6), 0 0 40px rgba(34,200,68,0.2); }
  }
  @keyframes interlace {
    0%   { background-position: 0 0; }
    100% { background-position: 0 3px; }
  }
  @keyframes typeOn {
    from { width: 0; }
    to   { width: 100%; }
  }
  @keyframes fadeInLine {
    from { opacity:0; }
    to   { opacity:1; }
  }
  @keyframes marquee { from{transform:translateX(0)} to{transform:translateX(-50%)} }
  @keyframes bgFlicker {
    0%,100%{opacity:1} 92%{opacity:0.97} 94%{opacity:0.95} 96%{opacity:0.99}
  }
  @keyframes phosphorDrift {
    0%,100%{ text-shadow: 0 0 4px #22dd44; }
    33%    { text-shadow: 1px 0 6px #22dd44; }
    66%    { text-shadow: -1px 0 6px #22dd44; }
  }
`;

const G = {
  bg:       '#020804',    // near-black with green tint
  phosphor: '#22dd44',    // phosphor green
  bright:   '#44ff66',    // bright phosphor
  dim:      '#116622',    // dim phosphor
  faint:    '#0a3315',    // very dim green
  amber:    '#ddaa22',    // amber variant (system messages)
  white:    '#cce8cc',    // phosphor white
} as const;

const MONO = "'Courier New', 'Courier', 'Lucida Console', monospace";

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

// Auto-typing line component
function TypeLine({
  text,
  delay = 0,
  speed = 40,
  prefix = '',
  color = G.phosphor,
  style: extraStyle,
}: {
  text: string;
  delay?: number;
  speed?: number;
  prefix?: string;
  color?: string;
  style?: React.CSSProperties;
}) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          started = true;
          let i = 0;
          const t = setTimeout(() => {
            const interval = setInterval(() => {
              i++;
              setDisplayed(text.slice(0, i));
              if (i >= text.length) {
                clearInterval(interval);
                setDone(true);
              }
            }, speed);
          }, delay);
          io.disconnect();
          return () => clearTimeout(t);
        }
      },
      { threshold: 0.1 },
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, [text, delay, speed]);

  return (
    <div ref={ref} style={{ fontFamily: MONO, color, lineHeight: 1.6, ...extraStyle }}>
      {prefix && <span style={{ color: G.dim }}>{prefix}</span>}
      {displayed}
      {!done && (
        <span style={{ animation: 'blink 0.7s step-end infinite', color: G.bright }}>█</span>
      )}
    </div>
  );
}

// ASCII box
function AsciiBox({
  title,
  children,
  width = '100%',
}: {
  title?: string;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div
      style={{
        fontFamily: MONO,
        color: G.phosphor,
        width,
        margin: '0 auto',
      }}
    >
      {/* Top border */}
      <div style={{ color: G.dim }}>
        ╔{title
          ? `══[ ${title} ]${'═'.repeat(Math.max(0, 60 - title.length - 6))}╗`
          : '═'.repeat(62) + '╗'}
      </div>
      <div style={{ padding: '0 2px' }}>
        {children}
      </div>
      {/* Bottom border */}
      <div style={{ color: G.dim }}>{'╚' + '═'.repeat(62) + '╝'}</div>
    </div>
  );
}

// CRT screen overlay — scanlines + phosphor glow
function CRTOverlay() {
  return (
    <>
      {/* Moving scanline */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1000,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: '15%',
            background: 'linear-gradient(transparent, rgba(34,220,68,0.03), transparent)',
            animation: 'scanline 6s linear infinite',
          }}
        />
        {/* Scanlines */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 3px)',
            pointerEvents: 'none',
          }}
        />
        {/* Vignette */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 60%, rgba(0,0,0,0.6) 100%)',
            pointerEvents: 'none',
          }}
        />
      </div>
    </>
  );
}

// Section header — ASCII decorated
function TermSection({ n, label }: { n: string; label: string }) {
  return (
    <div
      data-fade
      style={{
        fontFamily: MONO,
        color: G.dim,
        margin: '4rem 0 2rem',
        fontSize: '0.75rem',
      }}
    >
      <div>{'┌─' + '─'.repeat(56) + '─┐'}</div>
      <div>
        {'│  '}
        <span style={{ color: G.amber }}>§{n}</span>
        {'  '}
        <span style={{ color: G.phosphor }}>{label}</span>
        {'  '}
        <span style={{ color: G.faint }}>{'─'.repeat(Math.max(0, 50 - label.length - n.length - 4))}</span>
        {'│'}
      </div>
      <div>{'└─' + '─'.repeat(56) + '─┘'}</div>
    </div>
  );
}

// Protocol step — terminal style
function TermStep({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div
      data-fade
      data-delay={String(n * 60)}
      style={{
        fontFamily: MONO,
        marginBottom: '1rem',
        paddingLeft: '1rem',
        borderLeft: `2px solid ${G.faint}`,
      }}
    >
      <div style={{ color: G.amber, fontSize: '0.65rem' }}>
        STEP_{String(n).padStart(2, '0')}:
      </div>
      <div style={{ color: G.bright, fontSize: '0.8rem', marginBottom: '0.15rem' }}>
        {title.toUpperCase()}
      </div>
      <div style={{ color: G.dim, fontSize: '0.72rem' }}>
        // {desc}
      </div>
    </div>
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

// Boot sequence component
function BootSequence() {
  const lines = [
    { text: 'INDEX NETWORK PROTOCOL v1.0.0', delay: 0, color: G.bright },
    { text: 'Copyright (c) 1983-2026 Index Network Corp.', delay: 400, color: G.dim },
    { text: '', delay: 600, color: G.dim },
    { text: 'Initializing language substrate...        [OK]', delay: 800, color: G.phosphor },
    { text: 'Loading intent parser...                  [OK]', delay: 1100, color: G.phosphor },
    { text: 'Connecting to agent network...            [OK]', delay: 1400, color: G.phosphor },
    { text: 'Calibrating opportunity scanner...        [OK]', delay: 1700, color: G.phosphor },
    { text: '', delay: 2000, color: G.dim },
    { text: 'DOCUMENT: found_in_translation.txt', delay: 2100, color: G.amber },
    { text: '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', delay: 2200, color: G.dim },
  ];

  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    lines.forEach((line, i) => {
      setTimeout(() => setVisibleCount(i + 1), line.delay + 200);
    });
  }, []);

  return (
    <div style={{ fontFamily: MONO, fontSize: '0.72rem', lineHeight: 1.8 }}>
      {lines.slice(0, visibleCount).map((line, i) => (
        <div
          key={i}
          style={{
            color: line.color,
            animation: 'fadeInLine 0.15s ease',
          }}
        >
          {line.text || '\u00A0'}
        </div>
      ))}
    </div>
  );
}

// ASCII art logo
function ASCIITitle() {
  return (
    <pre
      style={{
        fontFamily: MONO,
        fontSize: 'clamp(0.3rem, 0.8vw, 0.65rem)',
        lineHeight: 1.2,
        color: G.phosphor,
        margin: '2rem 0',
        animation: 'glowPulse 4s ease-in-out infinite',
        letterSpacing: '0.05em',
        overflow: 'hidden',
      }}
    >
{`
 _____ ___  _   _ _   _ ____      ___ _   _
|  ___/ _ \\| | | | \\ | |  _ \\    |_ _| \\ | |
| |_ | | | | | | |  \\| | | | |    | ||  \\| |
|  _|| |_| | |_| | |\\  | |_| |    | || |\\  |
|_|   \\___/ \\___/|_| \\_|____/    |___|_| \\_|

 _____ ____      _    _   _ ____  _        _  _____ ___ ___  _   _
|_   _|  _ \\    / \\  | \\ | / ___|| |      / \\|_   _|_ _/ _ \\| \\ | |
  | | | |_) |  / _ \\ |  \\| \\___ \\| |     / _ \\ | |  | | | | |  \\| |
  | | |  _ <  / ___ \\| |\\  |___) | |___ / ___ \\| |  | | |_| | |\\  |
  |_| |_| \\_\\/_/   \\_\\_| \\_|____/|_____/_/   \\_\\_| |___\\___/|_| \\_|
`}
    </pre>
  );
}

// ASCII bar chart
function ASCIIBarChart({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((i) => i.value));
  return (
    <div data-fade style={{ fontFamily: MONO, fontSize: '0.7rem', margin: '2rem 0' }}>
      <div style={{ color: G.dim, marginBottom: '0.5rem' }}>
        // TRANSLATION LOSS BY INTERFACE TYPE
      </div>
      {items.map(({ label, value }) => {
        const bars = Math.round((value / max) * 40);
        return (
          <div key={label} style={{ display: 'flex', gap: '1rem', marginBottom: '0.4rem', alignItems: 'center' }}>
            <span style={{ color: G.dim, width: '10ch', textAlign: 'right', flexShrink: 0 }}>
              {label.padStart(10)}
            </span>
            <span style={{ color: G.phosphor }}>│</span>
            <span style={{ color: G.bright }}>{'█'.repeat(bars)}</span>
            <span style={{ color: G.dim, fontSize: '0.6rem' }}>{value}%</span>
          </div>
        );
      })}
      <div style={{ color: G.dim, marginTop: '0.25rem' }}>
        {'           └' + '─'.repeat(42)}
      </div>
    </div>
  );
}

export default function FoundInTranslation5() {
  const pageRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress();

  // Fade-in for data-fade elements
  useEffect(() => {
    if (!pageRef.current) return;
    const els = pageRef.current.querySelectorAll<HTMLElement>('[data-fade]');
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${el.dataset.delay ?? 0}ms`;
          el.style.opacity = '1';
          el.style.transform = 'none';
        }),
      { threshold: 0.04 },
    );
    els.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      el.style.transition = 'opacity .6s ease, transform .6s ease';
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const P: React.CSSProperties = {
    fontFamily: MONO,
    fontSize: '0.82rem',
    lineHeight: 1.85,
    color: G.phosphor,
    marginBottom: '1.5rem',
  };

  const WRAP: React.CSSProperties = {
    maxWidth: 780,
    margin: '0 auto',
    padding: '0 2rem',
  };

  return (
    <div
      ref={pageRef}
      style={{
        background: G.bg,
        color: G.phosphor,
        minHeight: '100vh',
        overflowX: 'hidden',
        animation: 'bgFlicker 8s ease-in-out infinite',
      }}
    >
      <style>{KF}</style>
      <CRTOverlay />

      {/* Progress bar — phosphor */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          zIndex: 200,
          background: G.faint,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: G.bright,
            boxShadow: `0 0 6px ${G.bright}`,
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* ══ BOOT / HERO ══ */}
      <section
        style={{
          minHeight: '100vh',
          padding: '4rem 2rem 5rem',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ ...WRAP }}>
          {/* Nav */}
          <div
            style={{
              fontFamily: MONO,
              fontSize: '0.62rem',
              color: G.dim,
              marginBottom: '3rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <Link to="/" style={{ color: G.dim, textDecoration: 'none' }}>
              INDEX_NETWORK://HOME
            </Link>
            <span>PROTOCOL DOC · LANG_INTENT · V1.0</span>
          </div>

          {/* ASCII title */}
          <ASCIITitle />

          {/* Boot sequence */}
          <BootSequence />

          {/* Scroll indicator */}
          <div
            style={{
              marginTop: '3rem',
              fontFamily: MONO,
              fontSize: '0.65rem',
              color: G.dim,
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            <span style={{ animation: 'blink 1.5s step-end infinite', color: G.phosphor }}>▼</span>
            SCROLL_TO_READ :: PRESS_ANY_KEY_OR_SCROLL
          </div>
        </div>
      </section>

      {/* Divider line */}
      <div style={{ ...WRAP }}>
        <div style={{ fontFamily: MONO, color: G.dim, fontSize: '0.7rem' }}>
          {'═'.repeat(76)}
        </div>
      </div>

      {/* ══ SECTION 01 ══ */}
      <div style={{ ...WRAP, padding: '4rem 2rem 2rem' }}>
        <TermSection n="01" label="THE_CONVERSATION" />

        <div data-fade style={{ marginBottom: '2rem' }}>
          <TypeLine
            text="> loading section_01.txt..."
            color={G.dim}
            speed={30}
          />
        </div>

        <p
          data-fade
          style={{
            ...P,
            fontSize: '0.9rem',
            color: G.white,
            fontStyle: 'italic',
          }}
        >
          /*<br />
          &nbsp;* They get archived away in secret conversations,<br />
          &nbsp;* thoughts expressed as free agents between a second<br />
          &nbsp;* margarita with a coworker on a sunny patio—where<br />
          &nbsp;* language flows as naturally as it gets.<br />
          &nbsp;*/
        </p>

        {/* ASCII image placeholder */}
        <div
          data-fade
          style={{
            fontFamily: MONO,
            fontSize: '0.68rem',
            color: G.dim,
            margin: '2rem 0',
            lineHeight: 1.4,
          }}
        >
          <div>╔{'═'.repeat(62)}╗</div>
          <div>{'║'}{' '.repeat(25)}[Fig. 01]{' '.repeat(29)}{'║'}</div>
          <div>{'║'}{' '.repeat(62)}{'║'}</div>
          <div>{'║'}  <span style={{ color: G.phosphor }}>Abstract image: two people talking</span>{' '.repeat(22)}{'║'}</div>
          <div>{'║'}  <span style={{ color: G.dim }}>"i have this idea, is it crazy?"</span>{' '.repeat(21)}{'║'}</div>
          <div>{'║'}  <span style={{ color: G.dim }}>"is there anyone else who cares?"</span>{' '.repeat(21)}{'║'}</div>
          <div>{'║'}{' '.repeat(62)}{'║'}</div>
          <div>╚{'═'.repeat(62)}╝</div>
        </div>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>You sleep on your idea, wake up and start searching for someone</span><br />
          {'// '}<span style={{ color: G.white }}>who might just share your flavor of weird.</span>
        </p>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>For most of computing history, there was no system elastic enough</span><br />
          {'// '}<span style={{ color: G.white }}>to hold that kind of ambiguity.</span>
        </p>

        {/* LOST IN TRANSLATION — big CRT moment */}
        <div
          data-fade
          style={{
            margin: '3rem 0',
            padding: '3rem 2rem',
            border: `1px solid ${G.faint}`,
            background: 'rgba(34,220,68,0.02)',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'repeating-linear-gradient(transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 3px)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(1.2rem, 4vw, 3rem)',
              color: G.bright,
              animation: 'glowPulse 3s ease-in-out infinite',
              letterSpacing: '0.1em',
              position: 'relative',
            }}
          >
            LOST_IN_TRANSLATION
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '0.65rem',
              color: G.dim,
              marginTop: '1rem',
              position: 'relative',
            }}
          >
            ERROR: intent_never_fully_survived_handoff :: signal_degraded_in_transit
          </div>
        </div>
      </div>

      <div style={{ ...WRAP }}>
        <div style={{ fontFamily: MONO, color: G.faint, fontSize: '0.7rem' }}>
          {'─'.repeat(76)}
        </div>
      </div>

      {/* ══ SECTION 02 ══ */}
      <div style={{ ...WRAP, padding: '3rem 2rem 2rem' }}>
        <TermSection n="02" label="THE_TWO_SYSTEMS" />

        <p data-fade style={P}>
          {'> '}<span style={{ color: G.white }}>It starts with the center of how we make sense of things: the brain.</span>
        </p>

        {/* Two-column concept — terminal boxes */}
        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            margin: '2rem 0',
            fontFamily: MONO,
            fontSize: '0.7rem',
          }}
        >
          {[
            {
              id: 'SYS_I',
              name: 'HABITUAL',
              sub: 'Reactive system',
              body: 'Reflexes, patterns, snooze buttons. What you did.',
              color: G.dim,
            },
            {
              id: 'SYS_II',
              name: 'INTENTIONAL',
              sub: 'Planning system',
              body: 'Goals, models, long-game thinking. What you meant.',
              color: G.bright,
            },
          ].map(({ id, name, sub, body, color }) => (
            <div
              key={id}
              style={{
                border: `1px solid ${G.faint}`,
                padding: '1rem 1.25rem',
              }}
            >
              <div style={{ color: G.amber, marginBottom: '0.4rem', fontSize: '0.6rem' }}>
                {id}::
              </div>
              <div
                style={{
                  color,
                  fontSize: '1.1rem',
                  letterSpacing: '0.05em',
                  marginBottom: '0.4rem',
                  animation: color === G.bright ? 'glowPulse 4s ease-in-out infinite' : undefined,
                }}
              >
                {name}
              </div>
              <div style={{ color: G.dim, marginBottom: '0.75rem', fontSize: '0.6rem' }}>
                // {sub}
              </div>
              <div style={{ color: G.phosphor, lineHeight: 1.6 }}>
                {body}
              </div>
            </div>
          ))}
        </div>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>Most of what we call "intent" lives in the second system.</span><br />
          {'// '}<span style={{ color: G.white }}>Context-sensitive, continuously recalibrating.</span>
        </p>

        {/* Quote — terminal style */}
        <div
          data-fade
          style={{
            fontFamily: MONO,
            fontSize: '0.72rem',
            margin: '2rem 0',
            padding: '1.5rem',
            borderLeft: `3px solid ${G.amber}`,
            background: 'rgba(221,170,34,0.03)',
          }}
        >
          <div style={{ color: G.amber, marginBottom: '0.5rem', fontSize: '0.6rem' }}>
            QUOTE::EXTERNAL_SOURCE
          </div>
          <div style={{ color: G.white, lineHeight: 1.7, fontStyle: 'italic' }}>
            "When we say that meanings materialize, we mean that sensemaking<br />
            is, importantly, an issue of language, talk, and communication.<br />
            Situations, organizations, and environments are talked into existence."
          </div>
          <div style={{ color: G.dim, marginTop: '0.75rem', fontSize: '0.6rem' }}>
            SOURCE: Hinton, A. "Understanding Context" (2014)
          </div>
        </div>

        {/* CALLOUT */}
        <div
          data-fade
          style={{
            margin: '2.5rem 0',
            fontFamily: MONO,
            border: `1px solid ${G.phosphor}`,
            boxShadow: `0 0 12px rgba(34,220,68,0.1), inset 0 0 24px rgba(34,220,68,0.02)`,
          }}
        >
          <div style={{ background: G.phosphor, padding: '0.25rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: G.bg, fontWeight: 700, fontSize: '0.65rem' }}>
              ◉ SYSTEM MESSAGE
            </span>
          </div>
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <p
              style={{
                fontFamily: MONO,
                fontSize: 'clamp(0.85rem, 1.8vw, 1.1rem)',
                lineHeight: 1.5,
                color: G.bright,
                margin: 0,
                animation: 'glowPulse 5s ease-in-out infinite',
              }}
            >
              COMPUTERS DO NOT OPERATE ON RAW HUMAN INTENT,
              <br />ONLY ITS TRANSLATION.
            </p>
          </div>
        </div>

        {/* CLI/GUI as terminal */}
        <div data-fade style={{ fontFamily: MONO, fontSize: '0.7rem', margin: '2rem 0' }}>
          <div style={{ color: G.dim, marginBottom: '0.75rem' }}>// INTERFACE_EVOLUTION::</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ border: `1px solid ${G.faint}`, padding: '1rem' }}>
              <div style={{ color: G.amber, marginBottom: '0.5rem', fontSize: '0.6rem' }}>
                ERA::CLI // 1979
              </div>
              <div style={{ color: '#c8b448', lineHeight: 1.8 }}>
                <div><span style={{ color: G.dim }}>$ </span>find_job --role "eng"</div>
                <div><span style={{ color: G.dim }}>$ </span>filter --skill "rust"</div>
                <div><span style={{ color: G.dim }}>$ </span>apply --cv resume.pdf</div>
                <div style={{ animation: 'blink 1s step-end infinite' }}>█</div>
              </div>
              <div style={{ color: G.dim, marginTop: '0.75rem', fontSize: '0.6rem', lineHeight: 1.5 }}>
                // Explicit and exacting.<br />
                // Hard work for most humans.
              </div>
            </div>
            <div style={{ border: `1px solid ${G.faint}`, padding: '1rem' }}>
              <div style={{ color: G.amber, marginBottom: '0.5rem', fontSize: '0.6rem' }}>
                ERA::GUI // 1984
              </div>
              <div style={{ color: G.dim, lineHeight: 1.8 }}>
                <div>[██████████████] LOADING</div>
                <div>[◉] Job Title: ___________</div>
                <div>[◉] Location: ___________</div>
                <div>[▶] SEARCH NOW</div>
              </div>
              <div style={{ color: G.dim, marginTop: '0.75rem', fontSize: '0.6rem', lineHeight: 1.5 }}>
                // Easier interface.<br />
                // But intent? Still lost.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Break */}
      <div style={{ ...WRAP }}>
        <div style={{ fontFamily: MONO, color: G.faint, fontSize: '0.7rem' }}>{'─'.repeat(76)}</div>
      </div>

      {/* ══ SECTION 03 ══ */}
      <div style={{ ...WRAP, padding: '3rem 2rem 2rem' }}>
        <TermSection n="03" label="LANGUAGE_AS_INTERFACE" />

        <p data-fade style={{ ...P, fontSize: '0.9rem', color: G.white }}>
          {'> '}<span>LANGUAGE IS THE NEW INTERFACE</span>
          <span style={{ animation: 'blink 1s step-end infinite', marginLeft: 6 }}>█</span>
        </p>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>Instead of searching through platforms and engines,</span><br />
          {'// '}<span style={{ color: G.white }}>we're talking to LLMs. The translation tax that defined</span><br />
          {'// '}<span style={{ color: G.white }}>prior interfaces is slowly collapsing.</span>
        </p>

        <ASCIIBarChart
          items={[
            { label: 'TELEGRAPH', value: 95 },
            { label: 'TELEPHONE', value: 80 },
            { label: 'CLI', value: 70 },
            { label: 'GUI', value: 60 },
            { label: 'LLM', value: 30 },
            { label: 'AGENT', value: 8 },
          ]}
        />

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>For the first time, systems can engage with the model-based,</span><br />
          {'// '}<span style={{ color: G.white }}>context-sensitive layer of human decision-making.</span>
        </p>

        {/* Big callout */}
        <div
          data-fade
          style={{
            margin: '2.5rem 0',
            fontFamily: MONO,
            textAlign: 'center',
            padding: '3rem 2rem',
            border: `1px solid ${G.faint}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(circle, rgba(34,220,68,0.05) 1px, transparent 1px)',
              backgroundSize: '20px 20px',
              pointerEvents: 'none',
            }}
          />
          <p
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(0.9rem, 2.5vw, 1.6rem)',
              color: G.bright,
              margin: 0,
              letterSpacing: '0.12em',
              animation: 'glowPulse 4s ease-in-out infinite',
              position: 'relative',
            }}
          >
            "HAVE YOUR AGENT CALL MY AGENT."
          </p>
        </div>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>Not about a better matching algorithm.</span><br />
          {'// '}<span style={{ color: G.white }}>Redesigning how we think about finding our others.</span><br />
          {'// '}<span style={{ color: G.white }}>Agents trade gossip on behalf of users. Strategic cooperation.</span>
        </p>
      </div>

      {/* Break */}
      <div style={{ ...WRAP }}>
        <div style={{ fontFamily: MONO, color: G.faint, fontSize: '0.7rem' }}>{'─'.repeat(76)}</div>
      </div>

      {/* ══ SECTION 04: Protocol ══ */}
      <div style={{ ...WRAP, padding: '3rem 2rem 2rem' }}>
        <TermSection n="04" label="THE_PROTOCOL" />

        <div data-fade style={{ fontFamily: MONO, fontSize: '0.8rem', color: G.white, marginBottom: '2rem' }}>
          {'> '}<span>cat emerging_model_of_social_coordination.txt</span>
        </div>

        <div style={{ margin: '2rem 0' }}>
          {FLOW.map((step, i) => (
            <TermStep key={i} n={i + 1} title={step.t} desc={step.d} />
          ))}
        </div>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>The human sets the initial judgment and still has the final say.</span><br />
          {'// '}<span style={{ color: G.white }}>Agents are autonomous in facilitating, not deciding.</span>
        </p>

        <div
          data-fade
          style={{
            margin: '2.5rem 0',
            fontFamily: MONO,
            fontSize: '0.8rem',
            padding: '1.5rem',
            background: 'rgba(34,220,68,0.03)',
            border: `1px solid ${G.faint}`,
            borderLeft: `3px solid ${G.phosphor}`,
          }}
        >
          <div style={{ color: G.dim, marginBottom: '0.5rem', fontSize: '0.6rem' }}>LOG_ENTRY::</div>
          <div style={{ color: G.white, lineHeight: 1.7 }}>
            "It's more than training a better model. It's an operating protocol<br />
            for cooperation—standard procedures for agent-to-agent relationships<br />
            that let trust compound over time."
          </div>
        </div>
      </div>

      {/* Break */}
      <div style={{ ...WRAP }}>
        <div style={{ fontFamily: MONO, color: G.faint, fontSize: '0.7rem' }}>{'─'.repeat(76)}</div>
      </div>

      {/* ══ SECTION 05 ══ */}
      <div style={{ ...WRAP, padding: '3rem 2rem 4rem' }}>
        <TermSection n="05" label="AMBIENT_OPTIMISM" />

        <p data-fade style={{ ...P, fontSize: '0.9rem', color: G.white }}>
          {'> '}<span>engineering_serendipity --mode=ambient --output=optimism</span>
        </p>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>We can now realize opportunity value that previously remained</span><br />
          {'// '}<span style={{ color: G.white }}>latent because of lack of—or failed—coordination.</span>
        </p>

        <div
          data-fade
          style={{
            margin: '2.5rem 0',
            fontFamily: MONO,
          }}
        >
          <AsciiBox title="SYSTEM::AMBIENT_OPTIMISM">
            <div style={{ padding: '1rem 0.5rem', color: G.white, fontSize: '0.72rem', lineHeight: 1.8 }}>
              <div style={{ color: G.amber, marginBottom: '0.5rem' }}>DEFINITION::</div>
              <div>
                The quiet trust that the right opportunities<br />
                will find you.
              </div>
              <div style={{ marginTop: '1rem', color: G.dim }}>
                Not because you nailed your personal brand.<br />
                Not because you decoded the black box algos.<br />
                Because your intents are out there—<br />
                the new trading language of agents.
              </div>
            </div>
          </AsciiBox>
        </div>

        <p data-fade style={P}>
          {'// '}<span style={{ color: G.white }}>With far more patience and reach to find the right match.</span>
        </p>
      </div>

      {/* ══ CLOSING ══ */}
      <section
        style={{
          padding: 'clamp(5rem, 12vw, 12rem) 2rem',
          textAlign: 'center',
          background: 'rgba(34,220,68,0.015)',
          borderTop: `1px solid ${G.faint}`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(circle, rgba(34,220,68,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: '0.6rem',
              color: G.dim,
              letterSpacing: '0.2em',
              marginBottom: '3rem',
            }}
          >
            EOF :: found_in_translation.txt
          </div>

          <div
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(1.8rem, 6vw, 5.5rem)',
              lineHeight: 1.05,
              color: G.bright,
              animation: 'glowPulse 4s ease-in-out infinite',
              letterSpacing: '0.05em',
              marginBottom: '1rem',
            }}
          >
            YOUR_OTHERS<br />
            ARE_OUT<br />
            THERE.
          </div>

          <div
            style={{
              fontFamily: MONO,
              fontSize: 'clamp(0.9rem, 2.5vw, 1.8rem)',
              color: G.amber,
              animation: 'phosphorDrift 3s ease-in-out infinite',
              letterSpacing: '0.08em',
            }}
          >
            NOW_THEY_CAN_FIND_YOU_TOO.
          </div>

          <div
            style={{
              marginTop: '3rem',
              fontFamily: MONO,
              fontSize: '0.65rem',
              color: G.dim,
            }}
          >
            <span style={{ animation: 'blink 1s step-end infinite' }}>█</span>
            {' '}PRESS ANY KEY TO CONTINUE
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: `1px solid ${G.faint}`,
          padding: '1.25rem 2.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: MONO,
            fontSize: '0.65rem',
            color: G.dim,
            textDecoration: 'none',
            letterSpacing: '0.1em',
          }}
        >
          INDEX_NETWORK://HOME
        </Link>
        <Link
          to="/blog"
          style={{
            fontFamily: MONO,
            fontSize: '0.65rem',
            color: G.dim,
            textDecoration: 'none',
            letterSpacing: '0.1em',
          }}
        >
          ../LETTERS
        </Link>
      </footer>
    </div>
  );
}
