'use client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

// ── Found in Translation -1: Superstudio / Continuous Monument ──
// Inspired by Superstudio's 1969 utopian megastructure aesthetic:
// stark white, thick black borders, all-caps grotesque, architectural grid

const KF = `
  @keyframes marchDown {
    from { background-position: 0 0; }
    to   { background-position: 0 40px; }
  }
  @keyframes marchRight {
    from { background-position: 0 0; }
    to   { background-position: 40px 0; }
  }
  @keyframes scanH {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(100vh); }
  }
  @keyframes blinkHard {
    0%,49%  { opacity: 1; }
    50%,100%{ opacity: 0; }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(40px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes ticker {
    from { transform: translateX(0); }
    to   { transform: translateX(-50%); }
  }
`;

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
          el.style.transitionDelay = `${(el.dataset.delay ?? 0)}ms`;
          el.style.opacity = '1';
          el.style.transform = 'none';
        }),
      { threshold: 0.06 },
    );
    els.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = 'opacity .6s ease, transform .6s ease';
      io.observe(el);
    });
    return () => io.disconnect();
  }, [ref]);
}

// Grid canvas — the infinite Continuous Monument grid
function GridCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf: number;
    let offset = 0;
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    resize(); addEventListener('resize', resize);
    const draw = () => {
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      const sz = 60;
      const ox = offset % sz;
      for (let x = -sz + ox; x < W + sz; x += sz) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = -sz + ox; y < H + sz; y += sz) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // vanishing point perspective lines from center
      const cx = W / 2, cy = H * 0.45;
      ctx.strokeStyle = 'rgba(0,0,0,0.04)';
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const ex = cx + Math.cos(angle) * W;
        const ey = cy + Math.sin(angle) * H;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
      }
      offset += 0.3;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', inset: 0, zIndex: 0 }}
    />
  );
}

// The Monument — a slowly scrolling architectural section marker
function MonumentDivider({ label, n }: { label: string; n: string }) {
  return (
    <div
      style={{
        margin: '0',
        borderTop: '3px solid #000',
        borderBottom: '3px solid #000',
        display: 'grid',
        gridTemplateColumns: '80px 1fr 80px',
        height: 64,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          borderRight: '3px solid #000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          color: '#000',
        }}
      >
        {n}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 900,
          fontSize: 'clamp(0.7rem, 1.5vw, 0.85rem)',
          letterSpacing: '0.35em',
          textTransform: 'uppercase',
          color: '#000',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {/* marching ants text */}
        <div style={{ animation: 'ticker 18s linear infinite', display: 'flex', gap: '4em' }}>
          {[0, 1, 2, 3].map((k) => (
            <span key={k}>{label}</span>
          ))}
        </div>
      </div>
      <div
        style={{
          borderLeft: '3px solid #000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.6rem',
          letterSpacing: '0.15em',
          color: '#000',
        }}
      >
        {n}
      </div>
    </div>
  );
}

function ArchCallout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-fade
      style={{
        margin: '4rem 0',
        border: '3px solid #000',
        padding: '3rem 3.5rem',
        background: '#000',
        color: '#fff',
        position: 'relative',
      }}
    >
      <p
        style={{
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 900,
          fontSize: 'clamp(1.4rem, 3.5vw, 2.6rem)',
          lineHeight: 1.1,
          letterSpacing: '-0.01em',
          textTransform: 'uppercase',
          margin: 0,
        }}
      >
        {children}
      </p>
      {/* corner marks */}
      {[
        { top: 8, left: 8 },
        { top: 8, right: 8 },
        { bottom: 8, left: 8 },
        { bottom: 8, right: 8 },
      ].map((pos, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            width: 12,
            height: 12,
            border: '2px solid #fff',
            ...pos,
          }}
        />
      ))}
    </div>
  );
}

function StructureCard({ title, sub, body }: { title: string; sub: string; body: string }) {
  return (
    <div
      data-fade
      style={{
        border: '3px solid #000',
        padding: '2rem',
        background: '#fff',
        position: 'relative',
      }}
    >
      <div
        style={{
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.55rem',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
          color: '#666',
        }}
      >
        {sub}
      </div>
      <div
        style={{
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontWeight: 900,
          fontSize: 'clamp(1.6rem, 3vw, 2.2rem)',
          letterSpacing: '-0.02em',
          textTransform: 'uppercase',
          marginBottom: '1rem',
          color: '#000',
          lineHeight: 1,
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
          fontSize: '0.85rem',
          lineHeight: 1.7,
          color: '#333',
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}

// Architectural image placeholder with crosshairs
function ArchFigure({ label, ratio = '16/9', text }: { label: string; ratio?: string; text: string }) {
  return (
    <figure
      data-fade
      style={{
        margin: '3rem 0',
        border: '3px solid #000',
        aspectRatio: ratio,
        position: 'relative',
        background: '#f0f0f0',
        overflow: 'hidden',
      }}
    >
      {/* crosshair */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 1, background: '#000', opacity: 0.15 }} />
        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#000', opacity: 0.15 }} />
        <p
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontSize: '0.8rem',
            textAlign: 'center',
            color: '#666',
            maxWidth: '40ch',
            lineHeight: 1.5,
            position: 'relative',
            zIndex: 1,
            padding: '0 2rem',
          }}
        >
          {text}
        </p>
      </div>
      {/* corner registration marks */}
      {[
        { top: 0, left: 0, borderTop: '3px solid #000', borderLeft: '3px solid #000', width: 20, height: 20 },
        { top: 0, right: 0, borderTop: '3px solid #000', borderRight: '3px solid #000', width: 20, height: 20 },
        { bottom: 0, left: 0, borderBottom: '3px solid #000', borderLeft: '3px solid #000', width: 20, height: 20 },
        { bottom: 0, right: 0, borderBottom: '3px solid #000', borderRight: '3px solid #000', width: 20, height: 20 },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', ...s }} />
      ))}
      <figcaption
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          fontFamily: "'IBM Plex Mono', monospace",
          fontSize: '0.5rem',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: '#999',
        }}
      >
        {label}
      </figcaption>
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

export default function FoundInTranslation1() {
  const pageRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress();
  useFadeIn(pageRef as React.RefObject<HTMLElement>);

  const P: React.CSSProperties = {
    fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
    fontSize: '1rem',
    lineHeight: 1.85,
    color: '#222',
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
      style={{ background: '#fff', color: '#000', minHeight: '100vh', overflowX: 'hidden' }}
    >
      <style>{KF}</style>

      {/* Progress bar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          zIndex: 100,
          background: '#e0e0e0',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress * 100}%`,
            background: '#000',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* ══ HERO: THE MONUMENT ══ */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          overflow: 'hidden',
          borderBottom: '3px solid #000',
        }}
      >
        <GridCanvas />

        {/* Top nav bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            borderBottom: '3px solid #000',
            height: 56,
            display: 'flex',
            alignItems: 'stretch',
            zIndex: 3,
            background: '#fff',
          }}
        >
          <div
            style={{
              borderRight: '3px solid #000',
              padding: '0 1.5rem',
              display: 'flex',
              alignItems: 'center',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.65rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}
          >
            <Link to="/" style={{ color: '#000', textDecoration: 'none' }}>
              Index Network
            </Link>
          </div>
          <div style={{ flex: 1 }} />
          <div
            style={{
              borderLeft: '3px solid #000',
              padding: '0 1.5rem',
              display: 'flex',
              alignItems: 'center',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#666',
            }}
          >
            Protocol Document · 01
          </div>
        </div>

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 2, padding: '5rem 3rem 3rem' }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: '#999',
              marginBottom: '2rem',
            }}
          >
            Continuous Monument Series · Language &amp; Intent
          </div>
          <h1
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(4rem, 14vw, 13rem)',
              lineHeight: 0.88,
              letterSpacing: '-0.04em',
              textTransform: 'uppercase',
              margin: 0,
              color: '#000',
            }}
          >
            Found
            <br />
            <span style={{ color: '#fff', WebkitTextStroke: '4px #000' }}>in</span>
            <br />
            Trans
            <br />
            lation
          </h1>
          <div
            style={{
              marginTop: '3rem',
              display: 'flex',
              gap: '3rem',
              alignItems: 'flex-end',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                fontSize: '0.9rem',
                color: '#444',
                lineHeight: 1.6,
                maxWidth: '28ch',
                margin: 0,
              }}
            >
              A protocol for things that find you. An infrastructure for intent.
            </p>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <div
                style={{
                  width: 1,
                  height: 60,
                  background: '#000',
                }}
              />
              <span
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '0.5rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: '#999',
                  writingMode: 'vertical-rl',
                  transform: 'rotate(180deg)',
                }}
              >
                scroll
              </span>
            </div>
          </div>
        </div>

        {/* Bottom coordinate bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            borderTop: '3px solid #000',
            height: 36,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            padding: '0 1.5rem',
            gap: '2rem',
            zIndex: 3,
          }}
        >
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.5rem', letterSpacing: '0.15em', color: '#fff', opacity: 0.5 }}>
            N 43°41′00″ E 11°15′00″
          </span>
          <div style={{ flex: 1, height: 1, background: '#fff', opacity: 0.15 }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: '0.5rem', letterSpacing: '0.15em', color: '#fff', opacity: 0.5 }}>
            INDEX NETWORK PROTOCOL
          </span>
        </div>
      </section>

      {/* ══ SECTION 01 ══ */}
      <MonumentDivider label="The Conversation" n="01" />

      <div style={{ ...WRAP, padding: '5rem 2rem 4rem' }}>
        <p
          data-fade
          style={{
            ...P,
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 300,
            fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
            lineHeight: 1.5,
            color: '#000',
            marginBottom: '3rem',
          }}
        >
          They get archived away in secret conversations, thoughts expressed as free agents between a second margarita with a coworker on a sunny patio—where language flows as naturally as it gets.
        </p>

        <ArchFigure
          label="Fig. 01 — The Conversation"
          text='Abstract image: two people talking — "i have this idea, is it crazy? is there anyone else who cares?"'
        />

        <p data-fade style={P}>
          You sleep on your idea, wake up and start searching for someone who might just share your flavor of weird.
        </p>

        <ArchFigure
          label="Fig. 02 — Futility of Search"
          ratio="21/6"
          text="Scrolling through endless pages of connections — a sense of irony and futility"
        />

        <p data-fade style={P}>
          You would think it gets easier—that technology was meant to help the stars align and deliver us the job that doesn't exist yet, or the investor who gets it.
        </p>
        <p data-fade style={P}>
          For most of computing history, there was no system elastic enough to hold that kind of ambiguity.
        </p>
      </div>

      {/* Dark monolith break */}
      <div
        style={{
          background: '#000',
          padding: 'clamp(5rem, 10vw, 10rem) 3rem',
          textAlign: 'center',
          borderTop: '3px solid #000',
          borderBottom: '3px solid #000',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* grid overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.3)',
              marginBottom: '3rem',
            }}
          >
            — Lost in Translation
          </div>
          <h2
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(2.5rem, 9vw, 8rem)',
              lineHeight: 0.9,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              color: '#fff',
              margin: 0,
            }}
          >
            Somewhere
            <br />
            along the way,
            <br />
            <span
              style={{
                color: '#000',
                WebkitTextStroke: '2px #fff',
              }}
            >
              we got lost
            </span>
          </h2>
        </div>
      </div>

      {/* ══ SECTION 02 ══ */}
      <MonumentDivider label="The Two Systems" n="02" />

      <div style={{ ...WRAP, padding: '5rem 2rem 4rem' }}>
        <p data-fade style={P}>It starts with the center of how we make sense of things: the brain.</p>

        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0',
            margin: '2.5rem 0',
            border: '3px solid #000',
          }}
        >
          <StructureCard
            title="Habitual"
            sub="System I — Reactive"
            body="Reflexes, patterns, snooze buttons. What you did."
          />
          <div style={{ borderLeft: '3px solid #000' }}>
            <StructureCard
              title="Intentional"
              sub="System II — Planning"
              body="Goals, models, long-game thinking. What you meant."
            />
          </div>
        </div>

        <p data-fade style={P}>
          Most of what we call "intent" lives in the second system. This is where all our long game thoughts live—context-sensitive and continuously recalibrating.
        </p>
        <p data-fade style={P}>
          As anyone who's ever looked for a new job knows, having the intent to switch jobs is easy. Expressing it in a way that's legible to others is a different story.
        </p>

        <ArchCallout>
          Computers do not operate on raw human intent, only its translation.
        </ArchCallout>

        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            margin: '2.5rem 0',
            border: '3px solid #000',
          }}
        >
          {[
            {
              era: 'Command Line Era',
              desc: 'Explicit and exacting. Hard work most of us don\'t have energy for.',
              code: ['$ find_job --role "engineer"', '$ filter --skill "rust"', '$ apply --cv resume.pdf', '█'],
              dark: true,
            },
            {
              era: 'GUI Era',
              desc: 'Easier to use, but increased the distance between intent and execution.',
              code: null,
              dark: false,
            },
          ].map(({ era, desc, code, dark }, i) => (
            <div
              key={i}
              style={{
                padding: '1.75rem',
                background: dark ? '#0a0a0a' : '#f5f5f5',
                borderLeft: i === 1 ? '3px solid #000' : undefined,
              }}
            >
              <div
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: '0.55rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: dark ? '#666' : '#999',
                  marginBottom: '1rem',
                }}
              >
                {era}
              </div>
              {code ? (
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '0.72rem',
                    color: '#c8b448',
                    lineHeight: 2,
                    marginBottom: '1rem',
                  }}
                >
                  {code.map((line, j) => (
                    <div key={j}>
                      {j < code.length - 1 ? (
                        <>
                          <span style={{ color: '#555' }}>$ </span>
                          {line.replace('$ ', '')}
                        </>
                      ) : (
                        <span style={{ animation: 'blinkHard 1s step-end infinite' }}>{line}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '0.5rem', marginBottom: '1rem' }}>
                  {['100%', '65%', '42%'].map((w, j) => (
                    <div
                      key={j}
                      style={{
                        height: 10,
                        background: '#ccc',
                        borderRadius: 1,
                        width: w,
                        marginBottom: 6,
                      }}
                    />
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {[0, 1, 2, 3].map((j) => (
                      <div
                        key={j}
                        style={{ width: 28, height: 28, background: '#bbb', borderRadius: 2 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <p
                style={{
                  fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                  fontSize: '0.8rem',
                  color: dark ? '#aaa' : '#555',
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                {desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* White-on-black break */}
      <div
        style={{
          background: '#fff',
          borderTop: '3px solid #000',
          borderBottom: '3px solid #000',
          padding: 'clamp(4rem, 8vw, 8rem) 3rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(1.8rem, 5vw, 4.5rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: '#000',
            maxWidth: 900,
            margin: '0 auto',
          }}
        >
          Translation at its best is still reductive. But what if translation could{' '}
          <span
            style={{
              background: '#000',
              color: '#fff',
              padding: '0 0.2em',
            }}
          >
            carry the original intent?
          </span>
        </p>
      </div>

      {/* ══ SECTION 03 ══ */}
      <MonumentDivider label="Language as Interface" n="03" />

      <div style={{ ...WRAP, padding: '5rem 2rem 4rem' }}>
        <h2
          data-fade
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(2.2rem, 5vw, 4rem)',
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
            color: '#000',
            marginBottom: '2.5rem',
          }}
        >
          Language
          <br />
          is the new
          <br />
          <span
            style={{
              background: '#000',
              color: '#fff',
              display: 'inline-block',
              padding: '0 0.15em',
            }}
          >
            Interface
          </span>
        </h2>

        <p data-fade style={P}>
          Instead of searching through platforms and engines, we're talking to LLMs. The translation tax that defined prior interfaces is slowly collapsing.
        </p>

        <ArchFigure
          label="Fig. 03 — New Interface"
          ratio="16/6"
          text="The next intent lives inside the search — something similar to Google vs. index"
        />

        <p data-fade style={P}>
          For the first time, systems can engage with the model-based, context-sensitive layer of human decision-making: the layer where intent actually lives.
        </p>
        <p data-fade style={P}>
          This redistributes influence. In the context of platforms that once brokered most professional connections—their grip loosens when the work is distributed among individual agents.
        </p>

        <ArchCallout>"Have your agent call my agent."</ArchCallout>

        <p data-fade style={P}>
          It's not about a better matching algorithm, but redesigning the way we think about finding our others. Because sometimes new opportunity needs privacy before visibility.
        </p>
        <p data-fade style={P}>
          Agents congregate in their own social networks and water coolers to trade gossip on behalf of their users. And that private sharing yields interesting, often unexpected results.
        </p>
      </div>

      {/* ══ SECTION 04 ══ */}
      <MonumentDivider label="The Protocol" n="04" />

      <div style={{ background: '#f5f5f5', padding: 'clamp(5rem, 8vw, 8rem) 2rem', borderBottom: '3px solid #000' }}>
        <div style={{ ...WRAP }}>
          <h2
            data-fade
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(2rem, 4.5vw, 3.5rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              color: '#000',
              marginBottom: '3rem',
            }}
          >
            The emerging
            <br />
            model of social
            <br />
            coordination
          </h2>

          {/* Flow steps — architectural numbered list */}
          <div style={{ margin: '3rem 0', border: '3px solid #000' }}>
            {FLOW.map((step, i) => (
              <div
                data-fade
                data-delay={String(i * 50)}
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1fr',
                  borderBottom: i < FLOW.length - 1 ? '1px solid #ddd' : 'none',
                  background: i % 2 === 0 ? '#fff' : '#f9f9f9',
                }}
              >
                <div
                  style={{
                    borderRight: '3px solid #000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    color: '#000',
                    padding: '1.25rem 0',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </div>
                <div style={{ padding: '1.25rem 1.5rem' }}>
                  <div
                    style={{
                      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                      color: '#000',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {step.t}
                  </div>
                  <p
                    style={{
                      fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                      fontSize: '0.78rem',
                      color: '#666',
                      lineHeight: 1.5,
                      margin: 0,
                    }}
                  >
                    {step.d}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <p data-fade style={P}>
            The human sets the initial judgment and still has the final say. Agents are autonomous in facilitating, not deciding.
          </p>

          <div
            data-fade
            style={{
              margin: '2.5rem 0',
              padding: '2.5rem',
              border: '3px solid #000',
              borderLeft: '8px solid #000',
              background: '#fff',
            }}
          >
            <p
              style={{
                fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
                fontWeight: 300,
                fontSize: 'clamp(1.1rem, 2.2vw, 1.4rem)',
                lineHeight: 1.5,
                color: '#000',
                margin: 0,
              }}
            >
              It's more than training a better model. It's an operating protocol for cooperation—standard procedures for agent-to-agent relationships that let trust compound over time.
            </p>
          </div>
        </div>
      </div>

      {/* ══ SECTION 05 ══ */}
      <MonumentDivider label="Ambient Optimism" n="05" />

      <div style={{ ...WRAP, padding: '5rem 2rem 6rem' }}>
        <h2
          data-fade
          style={{
            fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(2.2rem, 5vw, 4rem)',
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
            color: '#000',
            marginBottom: '2.5rem',
          }}
        >
          Entering
          <br />
          Ambient
          <br />
          Optimism
        </h2>

        <p data-fade style={P}>
          We can now realize opportunity value that previously remained latent because of lack of—or failed—coordination. Open up multiverses where you meet the person you just missed.
        </p>
        <p data-fade style={P}>
          We call this <strong>engineering serendipity</strong>. But the feeling it engenders is the powerful part:
        </p>

        <div
          data-fade
          style={{
            margin: '3rem 0',
            padding: '3rem',
            background: '#000',
            color: '#fff',
            border: '3px solid #000',
          }}
        >
          <p
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(1.4rem, 3vw, 2.2rem)',
              lineHeight: 1.1,
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Ambient optimism.
            <br />
            The quiet trust that
            <br />
            the right opportunities
            <br />
            will find you.
          </p>
        </div>

        <p data-fade style={P}>
          Not because you finally nailed your personal brand or figured out the black box algos, but because your intents are out there—the new trading language of agents with far more patience and reach.
        </p>
      </div>

      {/* ══ CLOSING MONUMENT ══ */}
      <div
        style={{
          background: '#000',
          padding: 'clamp(6rem, 14vw, 14rem) 3rem',
          textAlign: 'center',
          borderTop: '3px solid #000',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.25)',
              marginBottom: '4rem',
            }}
          >
            — Found in Translation
          </div>
          <p
            style={{
              fontFamily: "'Inter', 'Helvetica Neue', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(3rem, 10vw, 10rem)',
              lineHeight: 0.88,
              letterSpacing: '-0.04em',
              textTransform: 'uppercase',
              color: '#fff',
              margin: 0,
            }}
          >
            Your others
            <br />
            are out there.
            <br />
            <span
              style={{
                color: '#000',
                WebkitTextStroke: '2px #fff',
              }}
            >
              Now they can
              <br />
              find you too.
            </span>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer
        style={{
          borderTop: '3px solid #000',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
        }}
      >
        <div
          style={{
            padding: '1.5rem 2rem',
            borderRight: '1px solid #000',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
          }}
        >
          <Link to="/" style={{ color: '#000', textDecoration: 'none' }}>
            Index Network
          </Link>
        </div>
        <div
          style={{
            padding: '1.5rem 2rem',
            display: 'flex',
            justifyContent: 'flex-end',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.1em',
          }}
        >
          <Link to="/blog" style={{ color: '#000', textDecoration: 'none' }}>
            ← Back to Letters
          </Link>
        </div>
      </footer>
    </div>
  );
}
