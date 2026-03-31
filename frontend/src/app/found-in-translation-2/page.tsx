'use client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

// ── Found in Translation -2: 90s Apple Computer Style ──────────
// Inspired by early Macintosh/Apple IIc era advertising:
// "A funny thing happens when you design a computer everyone can use."
// Warm cream, clean serif + system sans, editorial photography placement,
// friendly rounded shapes, apple-warmth, "hello." simplicity

const KF = `
  @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(20px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes breathe {
    0%,100% { transform:scale(1); }
    50%      { transform:scale(1.012); }
  }
  @keyframes scrollIndicator {
    0%,100%{opacity:0.4; transform:translateY(0);}
    50%{opacity:1;transform:translateY(6px);}
  }
`;

// Apple System 7-inspired palette
const C = {
  cream:   '#faf7f0',
  paper:   '#f2ede2',
  warm:    '#e8e2d4',
  border:  '#c8bea8',
  ink:     '#1a1410',
  mid:     '#5a5040',
  light:   '#9a8e78',
  apple:   '#e8503a',  // Apple red
  blue:    '#3a6eca',  // Apple blue
  yellow:  '#e8b830',  // Apple yellow
  green:   '#4a9a48',  // Apple green
  purple:  '#8a48ca',  // Apple purple
  orange:  '#e87830',  // Apple orange
} as const;

const SERIF  = "'Georgia', 'Times New Roman', Times, serif";
const SYSTEM = "Chicago, 'Helvetica Neue', Helvetica, sans-serif";
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
      { threshold: 0.08 },
    );
    els.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(16px)';
      el.style.transition = 'opacity .8s ease, transform .8s ease';
      io.observe(el);
    });
    return () => io.disconnect();
  }, [ref]);
}

// Apple rainbow stripes
function RainbowStripes({ vertical = false }: { vertical?: boolean }) {
  const colors = [C.green, C.yellow, C.orange, C.apple, C.purple, C.blue];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        overflow: 'hidden',
      }}
    >
      {colors.map((color, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: vertical ? undefined : 4,
            width: vertical ? 4 : undefined,
            background: color,
          }}
        />
      ))}
    </div>
  );
}

// Mac window chrome — classic System 7 style
function MacWindow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      data-fade
      style={{
        border: `2px solid ${C.ink}`,
        borderRadius: 4,
        overflow: 'hidden',
        margin: '2.5rem 0',
        boxShadow: `2px 2px 0 ${C.ink}`,
      }}
    >
      {/* Title bar */}
      <div
        style={{
          background: `linear-gradient(to bottom, #f0ece4, #d8d2c4)`,
          borderBottom: `2px solid ${C.ink}`,
          padding: '0.4rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        {/* Close box */}
        <div
          style={{
            width: 12,
            height: 12,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
            fontFamily: SYSTEM,
          }}
        >
          ×
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <span
            style={{
              fontFamily: SYSTEM,
              fontSize: '0.72rem',
              fontWeight: 700,
              color: C.ink,
              letterSpacing: '0.02em',
            }}
          >
            {title}
          </span>
        </div>
        {/* Zoom box */}
        <div
          style={{
            width: 12,
            height: 12,
            border: `1.5px solid ${C.ink}`,
            borderRadius: 1,
          }}
        />
      </div>
      {/* Content */}
      <div
        style={{
          background: C.cream,
          padding: '1.25rem 1.5rem',
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Apple-style editorial image placeholder
function AppleFigure({
  desc,
  ratio = '4/3',
  caption,
  style: extraStyle,
}: {
  desc: string;
  ratio?: string;
  caption?: string;
  style?: React.CSSProperties;
}) {
  return (
    <figure
      data-fade
      style={{
        margin: '2.5rem 0',
        background: C.paper,
        border: `1px solid ${C.border}`,
        aspectRatio: ratio,
        position: 'relative',
        overflow: 'hidden',
        ...extraStyle,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          gap: '0.75rem',
        }}
      >
        {/* Camera icon (ascii-style) */}
        <div
          style={{
            fontFamily: MONO,
            fontSize: '1.5rem',
            color: C.light,
            lineHeight: 1,
          }}
        >
          ◻
        </div>
        <p
          style={{
            fontFamily: SERIF,
            fontSize: '0.85rem',
            fontStyle: 'italic',
            color: C.mid,
            textAlign: 'center',
            maxWidth: '34ch',
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          {desc}
        </p>
      </div>
      {caption && (
        <figcaption
          style={{
            position: 'absolute',
            bottom: '0.75rem',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: SYSTEM,
            fontSize: '0.62rem',
            color: C.light,
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// Apple-style pull quote with the characteristic warmth
function AppleQuote({ text, attribution }: { text: string; attribution?: string }) {
  return (
    <div
      data-fade
      style={{
        margin: '3.5rem 0',
        padding: '2.5rem 3rem',
        background: C.paper,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        position: 'relative',
      }}
    >
      {/* Decorative quotation mark */}
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1.5rem',
          fontFamily: SERIF,
          fontSize: '5rem',
          color: C.warm,
          lineHeight: 1,
          userSelect: 'none',
          fontStyle: 'italic',
        }}
      >
        "
      </div>
      <blockquote
        style={{
          fontFamily: SERIF,
          fontSize: 'clamp(1.05rem, 2vw, 1.3rem)',
          fontStyle: 'italic',
          lineHeight: 1.65,
          color: C.ink,
          margin: 0,
          position: 'relative',
        }}
      >
        {text}
      </blockquote>
      {attribution && (
        <cite
          style={{
            display: 'block',
            marginTop: '1rem',
            fontFamily: SYSTEM,
            fontSize: '0.7rem',
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

// Hello-style hero with Mac mouse/pointer feeling
function HelloHero() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw "hello." in cursive on a canvas, Mac-style
  useEffect(() => {
    const cv = canvasRef.current!;
    const ctx = cv.getContext('2d')!;
    cv.width = cv.offsetWidth * devicePixelRatio;
    cv.height = cv.offsetHeight * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    const w = cv.offsetWidth, h = cv.offsetHeight;

    // Draw Mac-style screen
    ctx.fillStyle = '#1a1a0a';
    ctx.fillRect(0, 0, w, h);

    // Screen glow
    const grd = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.6);
    grd.addColorStop(0, 'rgba(255,255,220,0.08)');
    grd.addColorStop(1, 'transparent');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    // "hello." text
    ctx.fillStyle = '#f0ede4';
    ctx.font = `italic ${Math.min(w * 0.22, 110)}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('hello.', w / 2, h / 2);

    // Scanlines
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(0, y, w, 1);
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        borderRadius: '4px 4px 0 0',
      }}
    />
  );
}

// System concepts — styled like Mac icon labels
function ConceptCard({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      data-fade
      style={{
        background: C.cream,
        border: `1px solid ${C.border}`,
        borderRadius: 4,
        padding: '1.75rem',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          border: `2px solid ${C.border}`,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1rem',
          background: C.paper,
          fontSize: '1.6rem',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          fontFamily: SYSTEM,
          fontSize: '0.78rem',
          fontWeight: 700,
          color: C.ink,
          marginBottom: '0.5rem',
        }}
      >
        {title}
      </div>
      <p
        style={{
          fontFamily: SERIF,
          fontSize: '0.85rem',
          color: C.mid,
          lineHeight: 1.6,
          margin: 0,
          fontStyle: 'italic',
        }}
      >
        {body}
      </p>
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

export default function FoundInTranslation2() {
  const pageRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress();
  useFadeIn(pageRef as React.RefObject<HTMLElement>);

  const P: React.CSSProperties = {
    fontFamily: SERIF,
    fontSize: '1.05rem',
    lineHeight: 1.85,
    color: C.mid,
    marginBottom: '1.65rem',
  };

  const WRAP: React.CSSProperties = {
    maxWidth: 680,
    margin: '0 auto',
    padding: '0 2rem',
  };

  return (
    <div
      ref={pageRef}
      style={{ background: C.cream, color: C.ink, minHeight: '100vh', overflowX: 'hidden' }}
    >
      <style>{KF}</style>

      {/* Progress bar — Apple rainbow */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          zIndex: 100,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${progress * 100}%`, height: '100%', overflow: 'hidden', transition: 'width 0.1s linear' }}>
          <RainbowStripes />
        </div>
      </div>

      {/* ══ HERO ══ */}
      <section
        style={{
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: C.cream,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Left — text */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '6rem 3.5rem 4rem',
          }}
        >
          {/* Nav */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '1.25rem 2.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid ${C.border}`,
            }}
          >
            <Link
              to="/"
              style={{
                fontFamily: SYSTEM,
                fontSize: '0.78rem',
                color: C.mid,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {/* Apple logo approximation */}
              <span style={{ fontSize: '1rem' }}>◉</span>
              Index Network
            </Link>
            <span
              style={{
                fontFamily: SYSTEM,
                fontSize: '0.65rem',
                color: C.light,
                letterSpacing: '0.05em',
              }}
            >
              Language &amp; Intent
            </span>
          </div>

          <div style={{ animation: 'fadeUp 1s ease 0.2s both' }}>
            <p
              style={{
                fontFamily: SYSTEM,
                fontSize: '0.72rem',
                color: C.light,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '1.5rem',
              }}
            >
              A funny thing happens when you design
              <br />a protocol everyone can use.
            </p>
            <h1
              style={{
                fontFamily: SERIF,
                fontWeight: 400,
                fontSize: 'clamp(3rem, 7vw, 5.5rem)',
                lineHeight: 1.0,
                fontStyle: 'italic',
                color: C.ink,
                margin: '0 0 2rem',
              }}
            >
              Found in
              <br />
              Translation.
            </h1>
            <p
              style={{
                fontFamily: SYSTEM,
                fontSize: '0.88rem',
                color: C.mid,
                lineHeight: 1.65,
                maxWidth: '30ch',
                marginBottom: '2.5rem',
              }}
            >
              Some things find you. Most don't. This is about changing that.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                animation: 'scrollIndicator 2s ease-in-out infinite',
              }}
            >
              <div style={{ width: 1, height: 32, background: C.border }} />
              <span style={{ fontFamily: SYSTEM, fontSize: '0.62rem', color: C.light }}>
                scroll to read
              </span>
            </div>
          </div>
        </div>

        {/* Right — Mac screen */}
        <div
          style={{
            background: C.warm,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 3rem',
            borderLeft: `1px solid ${C.border}`,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 360,
              animation: 'breathe 6s ease-in-out infinite',
            }}
          >
            {/* Mac body */}
            <div
              style={{
                background: '#d4cfc4',
                borderRadius: '6px 6px 4px 4px',
                border: `2px solid #b0aa9c`,
                overflow: 'hidden',
                boxShadow: '4px 8px 24px rgba(0,0,0,0.15)',
              }}
            >
              {/* Screen bezel */}
              <div
                style={{
                  background: '#1a1a0a',
                  margin: '1.25rem 1.25rem 0.75rem',
                  borderRadius: 3,
                  aspectRatio: '4/3',
                  overflow: 'hidden',
                  border: '2px solid #0a0a04',
                }}
              >
                <HelloHero />
              </div>
              {/* Disk slot */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  paddingBottom: '1rem',
                }}
              >
                <div
                  style={{
                    width: 60,
                    height: 4,
                    background: '#b0aa9c',
                    borderRadius: 2,
                    border: '1px solid #9a9490',
                  }}
                />
              </div>
            </div>
            {/* Mac base */}
            <div
              style={{
                background: '#c8c2b6',
                border: `2px solid #b0aa9c`,
                borderTop: 'none',
                borderRadius: '0 0 4px 4px',
                height: 20,
              }}
            />
            {/* Keyboard hint */}
            <p
              style={{
                fontFamily: SERIF,
                fontSize: '0.72rem',
                fontStyle: 'italic',
                color: C.light,
                textAlign: 'center',
                marginTop: '1rem',
              }}
            >
              The best tool is one that understands you.
            </p>
          </div>
        </div>
      </section>

      {/* Apple rainbow divider */}
      <RainbowStripes />

      {/* ══ SECTION 01: The Conversation ══ */}
      <div style={{ ...WRAP, padding: '5.5rem 2rem 4rem' }}>
        <div
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.62rem',
            color: C.light,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>01</span>
          <div style={{ height: 1, flex: 1, background: C.border }} />
          <span>The Conversation</span>
        </div>

        <p
          data-fade
          style={{
            ...P,
            fontFamily: SERIF,
            fontSize: 'clamp(1.15rem, 2.2vw, 1.45rem)',
            color: C.ink,
            lineHeight: 1.6,
            marginBottom: '2.5rem',
          }}
        >
          They get archived away in secret conversations, thoughts expressed as free agents between a second margarita with a coworker on a sunny patio—where language flows as naturally as it gets.
        </p>

        <AppleFigure
          desc='Abstract image of two people talking — "i have this idea, is it crazy? is there anyone else who cares?"'
          caption="Fig. 01 — The Conversation"
        />

        <p data-fade style={P}>
          You sleep on your idea, wake up and start searching for someone who might just share your flavor of weird.
        </p>

        <AppleFigure
          desc="Scrolling through endless pages of connections on Twitter / LinkedIn — a sense of irony and futility"
          ratio="21/7"
          caption="Fig. 02 — Futility of Search"
        />

        <p data-fade style={P}>
          You would think it gets easier—that technology was meant to help the stars align and deliver us the job that doesn't exist yet, or the investor who gets it.
        </p>
        <p data-fade style={P}>
          For most of computing history, there was no system elastic enough to hold that kind of ambiguity. The next opportunity ahead is often illegible to ourselves—until it arrives as the email we've been waiting for.
        </p>
      </div>

      {/* Dark cream break */}
      <div
        style={{
          background: '#2a2418',
          padding: 'clamp(5rem, 10vw, 10rem) 2.5rem',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: '3rem' }}>
          <RainbowStripes />
        </div>
        <h2
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 'clamp(2rem, 7vw, 6rem)',
            lineHeight: 1.05,
            fontStyle: 'italic',
            color: '#f0ede4',
            margin: '0 0 1.5rem',
          }}
        >
          Somewhere along the way,
          <br />
          <span style={{ color: '#c8b448' }}>we got lost</span>{' '}
          in translation.
        </h2>
        <p
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.85rem',
            color: 'rgba(240,237,228,0.5)',
            letterSpacing: '0.05em',
          }}
        >
          intent never fully survived the handoff
        </p>
      </div>

      {/* ══ SECTION 02: The Two Systems ══ */}
      <div style={{ ...WRAP, padding: '5.5rem 2rem 4rem' }}>
        <div
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.62rem',
            color: C.light,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>02</span>
          <div style={{ height: 1, flex: 1, background: C.border }} />
          <span>The Two Systems</span>
        </div>

        <p data-fade style={P}>It starts with the center of how we make sense of things: the brain.</p>

        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            margin: '2.5rem 0',
          }}
        >
          <ConceptCard
            icon="💭"
            title="Habitual"
            body="Reflexes, patterns, snooze buttons. What you did."
          />
          <ConceptCard
            icon="🎯"
            title="Intentional"
            body="Goals, models, long-game thinking. What you meant."
          />
        </div>

        <p data-fade style={P}>
          Most of what we call "intent" lives in the second system—context-sensitive and continuously recalibrating to our desired outcomes.
        </p>
        <p data-fade style={P}>
          As anyone who's ever looked for a new job knows, having the intent to switch jobs is easy. Expressing it in a way that's legible to others is a different story.
        </p>

        <AppleQuote
          text='"When we say that meanings materialize, we mean that sensemaking is, importantly, an issue of language, talk, and communication."'
          attribution="Andrew Hinton, Understanding Context (2014)"
        />

        <p data-fade style={P}>
          Over time, tools expanded the scope of opportunity. From telegraphs to telephones, command line interfaces to graphical user interfaces. Now language could travel. But there was always a caveat:
        </p>

        <MacWindow title="Computers don't understand you.">
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.1rem, 2.2vw, 1.35rem)',
              fontStyle: 'italic',
              color: C.ink,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            Computers do not operate on raw human intent,
            <br />only its translation.
          </p>
        </MacWindow>

        {/* CLI vs GUI */}
        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1rem',
            margin: '2.5rem 0',
          }}
        >
          {/* CLI */}
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: C.paper,
                padding: '0.6rem 0.75rem',
                borderBottom: `1px solid ${C.border}`,
                fontFamily: SYSTEM,
                fontSize: '0.62rem',
                color: C.light,
                letterSpacing: '0.08em',
              }}
            >
              Command Line Era
            </div>
            <div
              style={{
                background: '#0e0e08',
                padding: '0.75rem 1rem',
                fontFamily: MONO,
                fontSize: '0.68rem',
                color: '#c8b448',
                lineHeight: 2,
              }}
            >
              <div><span style={{ color: '#666' }}>$ </span>find_job --role "engineer"</div>
              <div><span style={{ color: '#666' }}>$ </span>filter --skill "rust"</div>
              <div><span style={{ color: '#666' }}>$ </span>apply --cv resume.pdf</div>
              <div>
                <span style={{ animation: 'blink 1s step-end infinite', color: '#c8b448' }}>█</span>
              </div>
            </div>
            <div style={{ padding: '0.75rem 1rem', background: C.cream }}>
              <p style={{ fontFamily: SERIF, fontSize: '0.78rem', fontStyle: 'italic', color: C.mid, lineHeight: 1.5, margin: 0 }}>
                Explicit and exacting. Hard work most of us don't have energy for.
              </p>
            </div>
          </div>

          {/* GUI */}
          <div
            style={{
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                background: C.paper,
                padding: '0.6rem 0.75rem',
                borderBottom: `1px solid ${C.border}`,
                fontFamily: SYSTEM,
                fontSize: '0.62rem',
                color: C.light,
                letterSpacing: '0.08em',
              }}
            >
              GUI Era
            </div>
            <div style={{ background: '#c8d4d4', padding: '0.75rem 1rem' }}>
              <div style={{ background: '#b0bebe', borderRadius: '2px 2px 0 0', padding: '0.3rem 0.4rem', display: 'flex', gap: '0.25rem', marginBottom: '0.3rem' }}>
                {['#ff5f57', '#ffbd2e', '#28c840'].map((c, i) => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                ))}
              </div>
              {['100%', '65%', '40%'].map((w, i) => (
                <div key={i} style={{ height: 9, background: '#a0b2b2', borderRadius: 1, width: w, marginBottom: 5 }} />
              ))}
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ width: 24, height: 24, background: '#98aaba', borderRadius: 2 }} />
                ))}
              </div>
            </div>
            <div style={{ padding: '0.75rem 1rem', background: C.cream }}>
              <p style={{ fontFamily: SERIF, fontSize: '0.78rem', fontStyle: 'italic', color: C.mid, lineHeight: 1.5, margin: 0 }}>
                Easier to use, but increased the distance between intent and execution.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Warm break */}
      <div
        style={{
          background: C.warm,
          padding: 'clamp(4rem, 8vw, 8rem) 3rem',
          textAlign: 'center',
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <p
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 'clamp(1.6rem, 4.5vw, 3.8rem)',
            fontStyle: 'italic',
            lineHeight: 1.2,
            color: C.ink,
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          Translation at its best is still reductive. But what if translation could{' '}
          <em style={{ color: C.blue }}>carry the original intent?</em>
        </p>
      </div>

      {/* ══ SECTION 03: Language as Interface ══ */}
      <div style={{ ...WRAP, padding: '5.5rem 2rem 4rem' }}>
        <div
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.62rem',
            color: C.light,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>03</span>
          <div style={{ height: 1, flex: 1, background: C.border }} />
          <span>Language as Interface</span>
        </div>

        <h2
          data-fade
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            lineHeight: 1.15,
            fontStyle: 'italic',
            color: C.ink,
            marginBottom: '2.5rem',
          }}
        >
          Language is the{' '}
          <span style={{ color: C.blue }}>new interface.</span>
        </h2>

        <p data-fade style={P}>
          Instead of searching through platforms and engines, we're talking to LLMs. The translation tax that defined prior interfaces is slowly collapsing.
        </p>

        <AppleFigure
          desc="The next intent lives inside the search — something like Google vs. index"
          ratio="16/7"
          caption="Fig. 03 — The New Interface"
        />

        <p data-fade style={P}>
          For the first time, systems can engage with the model-based, context-sensitive layer of human decision-making: the layer where intent actually lives.
        </p>
        <p data-fade style={P}>
          This redistributes influence. Platforms that once brokered most professional connections—their grip loosens when the work is distributed among individual agents navigating the open internet.
        </p>

        <MacWindow title="Have your agent call my agent.">
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.1rem, 2vw, 1.3rem)',
              fontStyle: 'italic',
              color: C.ink,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            "Have your agent call my agent."
          </p>
          <p
            style={{
              fontFamily: SYSTEM,
              fontSize: '0.75rem',
              color: C.light,
              marginTop: '0.75rem',
              marginBottom: 0,
            }}
          >
            The next coordination model.
          </p>
        </MacWindow>

        <p data-fade style={P}>
          It's not about a better matching algorithm, but redesigning the way we think about finding our others. Because sometimes new opportunity needs privacy before visibility.
        </p>
        <p data-fade style={P}>
          Agents congregate in their own social networks and water coolers to trade gossip on behalf of their users—and that private sharing yields interesting, often unexpected results.
        </p>
      </div>

      {/* ══ SECTION 04: The Protocol ══ */}
      <div
        style={{
          background: C.paper,
          padding: 'clamp(5rem, 8vw, 8rem) 2rem',
          borderTop: `1px solid ${C.border}`,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ ...WRAP }}>
          <div
            style={{
              fontFamily: SYSTEM,
              fontSize: '0.62rem',
              color: C.light,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: '2.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
            }}
          >
            <span>04</span>
            <div style={{ height: 1, flex: 1, background: C.border }} />
            <span>The Protocol</span>
          </div>

          <h2
            data-fade
            style={{
              fontFamily: SERIF,
              fontWeight: 400,
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              lineHeight: 1.15,
              fontStyle: 'italic',
              color: C.ink,
              marginBottom: '3rem',
            }}
          >
            The emerging model of{' '}
            <span style={{ color: C.green }}>social coordination.</span>
          </h2>

          {/* Flow steps — Apple HIG list style */}
          <div
            style={{
              margin: '2rem 0',
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              overflow: 'hidden',
            }}
          >
            {FLOW.map((step, i) => (
              <div
                data-fade
                data-delay={String(i * 40)}
                key={i}
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  padding: '1rem 1.25rem',
                  background: i % 2 === 0 ? C.cream : C.paper,
                  borderBottom: i < FLOW.length - 1 ? `1px solid ${C.border}` : 'none',
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: C.blue,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: SYSTEM,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: '0.1rem',
                  }}
                >
                  {i + 1}
                </div>
                <div>
                  <div
                    style={{
                      fontFamily: SYSTEM,
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: C.ink,
                      marginBottom: '0.2rem',
                    }}
                  >
                    {step.t}
                  </div>
                  <p
                    style={{
                      fontFamily: SERIF,
                      fontSize: '0.8rem',
                      fontStyle: 'italic',
                      color: C.mid,
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

          <p data-fade style={{ ...P }}>
            The human sets the initial judgment and still has the final say. Agents are autonomous in facilitating, not deciding.
          </p>

          <AppleQuote text="It's more than training a better model. It's an operating protocol for cooperation—standard procedures for agent-to-agent relationships that let trust compound over time." />
        </div>
      </div>

      {/* ══ SECTION 05: Ambient Optimism ══ */}
      <div style={{ ...WRAP, padding: '5.5rem 2rem 6rem' }}>
        <div
          style={{
            fontFamily: SYSTEM,
            fontSize: '0.62rem',
            color: C.light,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span>05</span>
          <div style={{ height: 1, flex: 1, background: C.border }} />
          <span>Ambient Optimism</span>
        </div>

        <h2
          data-fade
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 'clamp(1.8rem, 4vw, 3rem)',
            fontStyle: 'italic',
            color: C.ink,
            marginBottom: '2.5rem',
            lineHeight: 1.2,
          }}
        >
          Entering ambient optimism.
        </h2>

        <p data-fade style={P}>
          We can now realize opportunity value that previously remained latent because of lack of—or failed—coordination. Open up multiverses where you meet the person you just missed.
        </p>
        <p data-fade style={P}>
          We call this <strong style={{ fontWeight: 600, color: C.ink }}>engineering serendipity</strong>. But the feeling it engenders is the powerful part:
        </p>

        <div
          data-fade
          style={{
            margin: '3rem 0',
            padding: '2.5rem 3rem',
            background: C.paper,
            border: `1px solid ${C.border}`,
            borderRadius: 4,
            borderLeft: `4px solid ${C.apple}`,
          }}
        >
          <p
            style={{
              fontFamily: SERIF,
              fontSize: 'clamp(1.2rem, 2.5vw, 1.65rem)',
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
          background: '#1a1410',
          padding: 'clamp(6rem, 12vw, 12rem) 3rem',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div style={{ marginBottom: '3rem' }}>
          <RainbowStripes />
        </div>
        <p
          style={{
            fontFamily: MONO,
            fontSize: '0.55rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'rgba(240,237,228,0.3)',
            marginBottom: '3rem',
          }}
        >
          — found in translation
        </p>
        <p
          style={{
            fontFamily: SERIF,
            fontWeight: 400,
            fontSize: 'clamp(2.5rem, 8vw, 7rem)',
            lineHeight: 1.05,
            fontStyle: 'italic',
            color: '#f0ede4',
            margin: 0,
          }}
        >
          Your others
          <br />
          are out there.
          <br />
          <span style={{ color: '#c8b448' }}>
            Now they can
            <br />
            find you too.
          </span>
        </p>
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '2rem 2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: C.cream,
          borderTop: `1px solid ${C.border}`,
        }}
      >
        <Link
          to="/"
          style={{ fontFamily: SYSTEM, fontSize: '0.78rem', color: C.light, textDecoration: 'none' }}
        >
          Index Network
        </Link>
        <Link
          to="/blog"
          style={{ fontFamily: SYSTEM, fontSize: '0.78rem', color: C.light, textDecoration: 'none' }}
        >
          ← Back to Letters
        </Link>
      </footer>
    </div>
  );
}
