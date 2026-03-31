'use client';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

// ── Found in Translation -3: Abstract Geometric / Bauhaus ───────
// Pure shapes — circles, triangles, rectangles, grids.
// Swiss International Style meets Bauhaus:
// primary colors, mathematical layout, no decoration, no photography.
// Every element is a geometric statement.

const KF = `
  @keyframes rotateSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes rotateSlowRev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
  @keyframes pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.04)} }
  @keyframes slideRight { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  @keyframes fillBar { from { width: 0; } to { width: 100%; } }
  @keyframes ticker { from{transform:translateX(0)} to{transform:translateX(-50%)} }
`;

// Strict Bauhaus palette
const C = {
  white:  '#ffffff',
  black:  '#0a0a0a',
  red:    '#e63222',
  blue:   '#1a4ca8',
  yellow: '#f0c418',
  grey:   '#d0d0d0',
  midGrey:'#888888',
  darkGrey: '#333333',
} as const;

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
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity .7s ease, transform .7s ease';
      io.observe(el);
    });
    return () => io.disconnect();
  }, [ref]);
}

// The animated Bauhaus hero canvas
function BauhausHero() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    let raf: number;
    let t = 0;
    const resize = () => { cv.width = innerWidth; cv.height = innerHeight; };
    resize(); addEventListener('resize', resize);

    const draw = () => {
      const W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);

      // Grid
      ctx.strokeStyle = 'rgba(10,10,10,0.07)';
      ctx.lineWidth = 1;
      const g = Math.min(W, H) / 10;
      for (let x = 0; x < W; x += g) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += g) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      const cx = W / 2, cy = H / 2;

      // Large rotating circle — blue
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.2);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(W, H) * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = C.blue;
      ctx.lineWidth = 3;
      ctx.stroke();
      // Dash on circle
      ctx.setLineDash([8, 24]);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(W, H) * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(26,76,168,0.3)';
      ctx.lineWidth = 40;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // Large red rectangle (offset)
      const rw = Math.min(W, H) * 0.38, rh = Math.min(W, H) * 0.22;
      ctx.fillStyle = 'rgba(230,50,34,0.08)';
      ctx.fillRect(cx - rw / 2 + Math.sin(t * 0.15) * 20, cy - rh / 2 - Math.min(W, H) * 0.1, rw, rh);
      ctx.strokeStyle = C.red;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx - rw / 2 + Math.sin(t * 0.15) * 20, cy - rh / 2 - Math.min(W, H) * 0.1, rw, rh);

      // Yellow triangle
      const tr = Math.min(W, H) * 0.18;
      const tx = cx + Math.min(W, H) * 0.2 + Math.cos(t * 0.25) * 15;
      const ty2 = cy + Math.min(W, H) * 0.05 + Math.sin(t * 0.25) * 15;
      ctx.beginPath();
      ctx.moveTo(tx, ty2 - tr);
      ctx.lineTo(tx + tr * Math.cos(Math.PI / 6), ty2 + tr * Math.sin(Math.PI / 6));
      ctx.lineTo(tx - tr * Math.cos(Math.PI / 6), ty2 + tr * Math.sin(Math.PI / 6));
      ctx.closePath();
      ctx.fillStyle = 'rgba(240,196,24,0.15)';
      ctx.fill();
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Small black dot at center
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = C.black;
      ctx.fill();

      // Rotating arm
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.4);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -Math.min(W, H) * 0.28);
      ctx.strokeStyle = C.black;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // Dot at end of arm
      ctx.beginPath();
      ctx.arc(0, -Math.min(W, H) * 0.28, 5, 0, Math.PI * 2);
      ctx.fillStyle = C.red;
      ctx.fill();
      ctx.restore();

      t += 0.01;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />;
}

// Geometric section divider
function GeoDivider({ color }: { color: string }) {
  return (
    <div style={{ display: 'flex', height: 6 }}>
      <div style={{ flex: 2, background: color }} />
      <div style={{ flex: 1, background: C.black }} />
      <div style={{ flex: 3, background: color, opacity: 0.4 }} />
    </div>
  );
}

// Geometric shape annotation
function GeoAnnotation({ n, label, color }: { n: string; label: string; color: string }) {
  return (
    <div
      data-fade
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        marginBottom: '3rem',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          background: color,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
          fontWeight: 700,
          fontSize: '1rem',
          color: color === C.yellow ? C.black : C.white,
        }}
      >
        {n}
      </div>
      <span
        style={{
          fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
          fontWeight: 400,
          fontSize: '0.68rem',
          letterSpacing: '0.25em',
          textTransform: 'uppercase',
          color: C.midGrey,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.grey }} />
    </div>
  );
}

// Large bold geometric statement
function GeoStatement({ children, bg = C.black, color = C.white }: {
  children: React.ReactNode;
  bg?: string;
  color?: string;
}) {
  return (
    <div
      data-fade
      style={{
        margin: '4rem 0',
        background: bg,
        padding: '3rem 3.5rem',
      }}
    >
      <p
        style={{
          fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
          fontWeight: 700,
          fontSize: 'clamp(1.3rem, 3vw, 2.2rem)',
          lineHeight: 1.15,
          letterSpacing: '-0.01em',
          color,
          margin: 0,
          textTransform: 'uppercase',
        }}
      >
        {children}
      </p>
    </div>
  );
}

// Abstract data visualization
function GeoData({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <div data-fade style={{ margin: '3rem 0' }}>
      {items.map((item, i) => (
        <div key={i} style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
              fontSize: '0.62rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: C.midGrey,
              width: '14ch',
              flexShrink: 0,
            }}
          >
            {item.label}
          </span>
          <div style={{ flex: 1, height: 20, background: C.grey, position: 'relative', overflow: 'hidden' }}>
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                height: '100%',
                width: `${item.value}%`,
                background: item.color,
                transition: 'width 1s ease',
              }}
            />
          </div>
          <span
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
              fontWeight: 700,
              fontSize: '0.75rem',
              color: item.color,
              width: '4ch',
              textAlign: 'right',
            }}
          >
            {item.value}%
          </span>
        </div>
      ))}
    </div>
  );
}

// Geometric grid visualization for protocol steps
function GeoProtocol({ steps }: { steps: { t: string; d: string }[] }) {
  const colors = [C.red, C.blue, C.yellow, C.red, C.blue, C.yellow, C.red, C.blue, C.yellow, C.red];
  return (
    <div
      data-fade
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 2,
        margin: '3rem 0',
        background: C.black,
        border: `2px solid ${C.black}`,
      }}
    >
      {steps.map((step, i) => (
        <div
          key={i}
          data-delay={String(i * 40)}
          style={{
            background: C.white,
            padding: '1.25rem',
            borderTop: i >= 2 ? `2px solid ${C.black}` : undefined,
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              background: colors[i],
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
              fontWeight: 700,
              fontSize: '0.6rem',
              color: colors[i] === C.yellow ? C.black : C.white,
              marginBottom: '0.75rem',
            }}
          >
            {String(i + 1).padStart(2, '0')}
          </div>
          <div
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
              fontWeight: 700,
              fontSize: '0.78rem',
              lineHeight: 1.3,
              color: C.black,
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            {step.t}
          </div>
          <p
            style={{
              fontFamily: "'Helvetica Neue', Helvetica, sans-serif",
              fontSize: '0.72rem',
              color: C.midGrey,
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {step.d}
          </p>
        </div>
      ))}
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

export default function FoundInTranslation3() {
  const pageRef = useRef<HTMLDivElement>(null);
  const progress = useScrollProgress();
  useFadeIn(pageRef as React.RefObject<HTMLElement>);

  const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const P: React.CSSProperties = {
    fontFamily: SANS,
    fontSize: '1rem',
    lineHeight: 1.8,
    color: C.darkGrey,
    marginBottom: '1.5rem',
    fontWeight: 400,
  };

  const WRAP: React.CSSProperties = {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 2rem',
  };

  return (
    <div
      ref={pageRef}
      style={{ background: C.white, color: C.black, minHeight: '100vh', overflowX: 'hidden' }}
    >
      <style>{KF}</style>

      {/* Geometric progress bar */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          height: 6,
          background: C.grey,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${progress * 100}%`,
            background: C.red,
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* ══ HERO ══ */}
      <section
        style={{
          position: 'relative',
          minHeight: '100vh',
          background: C.white,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <BauhausHero />

        {/* Nav */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 3,
            display: 'grid',
            gridTemplateColumns: '56px 1fr auto 56px',
            height: 56,
          }}
        >
          <div style={{ background: C.red }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 1.5rem',
              borderBottom: `2px solid ${C.black}`,
            }}
          >
            <Link
              to="/"
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: '0.72rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: C.black,
                textDecoration: 'none',
              }}
            >
              Index Network
            </Link>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0 1.5rem',
              borderBottom: `2px solid ${C.black}`,
              fontFamily: SANS,
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: C.midGrey,
            }}
          >
            Protocol · Language
          </div>
          <div style={{ background: C.blue }} />
        </div>

        {/* Hero type */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            flex: 1,
            padding: '6rem 3rem 5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2rem' }}>
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ width: 20, height: 20, background: C.red }} />
                <div style={{ width: 20, height: 20, background: C.yellow }} />
                <div style={{ width: 20, height: 20, background: C.blue }} />
              </div>
              <h1
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 'clamp(4rem, 14vw, 13rem)',
                  lineHeight: 0.85,
                  letterSpacing: '-0.04em',
                  textTransform: 'uppercase',
                  margin: 0,
                  color: C.black,
                }}
              >
                Found
                <br />
                <span
                  style={{
                    color: C.white,
                    WebkitTextStroke: '3px ' + C.black,
                  }}
                >
                  In
                </span>
                <br />
                Trans
                <wbr />
                lation
              </h1>
            </div>
            {/* Big colored rectangle — Bauhaus composition element */}
            <div
              style={{
                width: 'clamp(60px, 8vw, 120px)',
                height: 'clamp(180px, 28vw, 380px)',
                background: C.red,
                flexShrink: 0,
                marginBottom: 8,
              }}
            />
          </div>
          <p
            style={{
              fontFamily: SANS,
              fontSize: '0.88rem',
              color: C.midGrey,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginTop: '2rem',
              maxWidth: '36ch',
            }}
          >
            A geometric inquiry into intent, language, and the infrastructure of discovery.
          </p>
        </div>
      </section>

      {/* Bauhaus stripe */}
      <div style={{ display: 'flex', height: 12 }}>
        <div style={{ flex: 3, background: C.black }} />
        <div style={{ flex: 2, background: C.red }} />
        <div style={{ flex: 1, background: C.yellow }} />
        <div style={{ flex: 2, background: C.blue }} />
      </div>

      {/* ══ SECTION 01 ══ */}
      <div style={{ ...WRAP, padding: '6rem 2rem 4rem' }}>
        <GeoAnnotation n="01" label="The Conversation" color={C.red} />

        <p
          data-fade
          style={{
            fontFamily: SANS,
            fontWeight: 300,
            fontSize: 'clamp(1.2rem, 2.5vw, 1.6rem)',
            lineHeight: 1.45,
            color: C.black,
            marginBottom: '3rem',
          }}
        >
          They get archived away in secret conversations, thoughts expressed between a second margarita with a coworker on a sunny patio—where language flows as naturally as it gets.
        </p>

        {/* Abstract geometric image placeholder */}
        <div
          data-fade
          style={{
            aspectRatio: '16/7',
            margin: '3rem 0',
            background: C.grey,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Geometric composition inside the "image" */}
          <div style={{ position: 'absolute', top: '20%', left: '15%', width: '28%', height: '60%', background: 'rgba(230,50,34,0.2)', border: '2px solid ' + C.red }} />
          <div style={{ position: 'absolute', top: '30%', right: '15%', width: '20%', height: '40%', borderRadius: '50%', background: 'rgba(26,76,168,0.2)', border: '2px solid ' + C.blue }} />
          <div style={{ position: 'absolute', bottom: '15%', left: '45%', width: 0, height: 0, borderLeft: '30px solid transparent', borderRight: '30px solid transparent', borderBottom: '52px solid rgba(240,196,24,0.5)' }} />
          <p
            style={{
              fontFamily: SANS,
              fontSize: '0.75rem',
              color: C.midGrey,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              position: 'relative',
              zIndex: 1,
              background: 'rgba(255,255,255,0.7)',
              padding: '0.5rem 1rem',
            }}
          >
            Fig. 01 — The Problem Space
          </p>
        </div>

        <p data-fade style={P}>
          You sleep on your idea, wake up and start searching for someone who might just share your flavor of weird.
        </p>
        <p data-fade style={P}>
          For most of computing history, there was no system elastic enough to hold that kind of ambiguity. The next opportunity ahead is often illegible to ourselves.
        </p>
      </div>

      {/* Geometric full-bleed statement */}
      <div
        style={{
          background: C.black,
          padding: 'clamp(5rem, 10vw, 10rem) 3rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Big circle decoration */}
        <div
          style={{
            position: 'absolute',
            right: '-10%',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '50vw',
            height: '50vw',
            borderRadius: '50%',
            border: `2px solid rgba(240,196,24,0.2)`,
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <h2
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 'clamp(2.5rem, 9vw, 8rem)',
              lineHeight: 0.88,
              letterSpacing: '-0.03em',
              textTransform: 'uppercase',
              color: C.white,
              margin: '0 0 2rem',
            }}
          >
            Lost.
            <br />
            <span style={{ color: C.red }}>In.</span>
            <br />
            Translation.
          </h2>
          <p
            style={{
              fontFamily: SANS,
              fontSize: '0.8rem',
              color: 'rgba(255,255,255,0.4)',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
            }}
          >
            The signal degraded in transit
          </p>
        </div>
      </div>

      {/* ══ SECTION 02 ══ */}
      <div style={{ ...WRAP, padding: '6rem 2rem 4rem' }}>
        <GeoAnnotation n="02" label="The Two Systems" color={C.blue} />

        <p data-fade style={P}>It starts with the center of how we make sense of things: the brain.</p>

        {/* Concept pair — pure geometric */}
        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            margin: '2.5rem 0',
          }}
        >
          {[
            { shape: '●', bg: C.grey, accent: C.midGrey, title: 'HABITUAL', sub: 'System I', body: 'Reflexes, patterns, snooze buttons. What you did.' },
            { shape: '◆', bg: C.black, accent: C.yellow, title: 'INTENTIONAL', sub: 'System II', body: 'Goals, models, long-game thinking. What you meant.' },
          ].map(({ shape, bg, accent, title, sub, body }) => (
            <div
              key={title}
              style={{
                background: bg,
                padding: '2.5rem',
              }}
            >
              <div style={{ fontSize: '2.5rem', color: accent, marginBottom: '1rem', lineHeight: 1 }}>
                {shape}
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: 'clamp(1.5rem, 3vw, 2.2rem)',
                  letterSpacing: '-0.02em',
                  textTransform: 'uppercase',
                  color: bg === C.black ? C.white : C.black,
                  lineHeight: 1,
                  marginBottom: '0.4rem',
                }}
              >
                {title}
              </div>
              <div
                style={{
                  fontFamily: SANS,
                  fontSize: '0.6rem',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: accent,
                  marginBottom: '0.75rem',
                }}
              >
                {sub}
              </div>
              <p style={{ fontFamily: SANS, fontSize: '0.85rem', color: bg === C.black ? 'rgba(255,255,255,0.6)' : C.darkGrey, lineHeight: 1.6, margin: 0 }}>
                {body}
              </p>
            </div>
          ))}
        </div>

        <p data-fade style={P}>
          Most of what we call "intent" lives in the second system—context-sensitive and continuously recalibrating to our desired outcomes.
        </p>
        <p data-fade style={P}>
          As anyone who's ever looked for a new job knows, having the intent to switch is easy. Expressing it in a way that's legible to others is a different story.
        </p>

        <GeoStatement bg={C.red} color={C.white}>
          Computers do not operate on raw human intent,
          only its translation.
        </GeoStatement>

        {/* Interface comparison — geometric */}
        <div
          data-fade
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 0,
            margin: '2.5rem 0',
            border: `2px solid ${C.black}`,
          }}
        >
          {[
            { era: 'CLI Era', color: C.black, text: 'Explicit and exacting. The translation tax was high.', dark: true },
            { era: 'GUI Era', color: C.grey, text: 'Easier, but the distance between intent and action grew.', dark: false },
          ].map(({ era, color, text, dark }, i) => (
            <div
              key={era}
              style={{
                borderLeft: i === 1 ? `2px solid ${C.black}` : undefined,
              }}
            >
              <div
                style={{
                  background: color,
                  height: 8,
                }}
              />
              <div style={{ padding: '1.5rem', background: dark ? '#111' : '#f5f5f5' }}>
                <div
                  style={{
                    fontFamily: SANS,
                    fontWeight: 700,
                    fontSize: '0.62rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: dark ? C.midGrey : C.darkGrey,
                    marginBottom: '0.75rem',
                  }}
                >
                  {era}
                </div>
                {/* Abstract screen representation */}
                <div
                  style={{
                    background: dark ? '#1a1a1a' : '#e0e8e8',
                    height: 80,
                    marginBottom: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    padding: '0.75rem',
                    gap: 6,
                  }}
                >
                  {dark
                    ? ['██ ████████████', '██ ████████', '██ █████████████', '█'].map((line, j) => (
                        <div key={j} style={{ fontFamily: 'monospace', fontSize: '0.6rem', color: '#c8b448', lineHeight: 1 }}>{line}</div>
                      ))
                    : ['100%', '60%', '80%'].map((w, j) => (
                        <div key={j} style={{ height: 10, background: dark ? C.midGrey : '#b0c0c0', width: w, borderRadius: 1 }} />
                      ))}
                </div>
                <p style={{ fontFamily: SANS, fontSize: '0.78rem', color: dark ? 'rgba(255,255,255,0.5)' : C.midGrey, lineHeight: 1.5, margin: 0 }}>
                  {text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Yellow full-bleed break */}
      <div
        style={{
          background: C.yellow,
          padding: 'clamp(4rem, 8vw, 8rem) 3rem',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 'clamp(1.6rem, 4.5vw, 4rem)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: C.black,
            maxWidth: 800,
            margin: '0 auto',
          }}
        >
          What if translation could carry
          the original intent?
        </p>
      </div>

      {/* ══ SECTION 03 ══ */}
      <div style={{ ...WRAP, padding: '6rem 2rem 4rem' }}>
        <GeoAnnotation n="03" label="Language as Interface" color={C.yellow} />

        <h2
          data-fade
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
            color: C.black,
            marginBottom: '2.5rem',
          }}
        >
          Language
          <br />
          is the
          <br />
          <span
            style={{
              background: C.blue,
              color: C.white,
              display: 'inline-block',
              padding: '0 0.12em',
            }}
          >
            New Interface
          </span>
        </h2>

        <p data-fade style={P}>
          Instead of searching through platforms and engines, we're talking to LLMs. The translation tax that defined prior interfaces is slowly collapsing.
        </p>

        <GeoData
          items={[
            { label: 'Search', value: 85, color: C.grey },
            { label: 'LLM Chat', value: 60, color: C.blue },
            { label: 'Agent', value: 22, color: C.red },
          ]}
        />

        <p data-fade style={P}>
          For the first time, systems can engage with the model-based, context-sensitive layer of human decision-making: the layer where intent actually lives.
        </p>

        <GeoStatement bg={C.blue} color={C.white}>
          "Have your agent call my agent."
        </GeoStatement>

        <p data-fade style={P}>
          It's not about a better matching algorithm. It's redesigning how we think about finding our others. Agents congregate in their own networks to trade gossip on behalf of their users—and that private sharing yields unexpected results.
        </p>
      </div>

      {/* ══ SECTION 04: Protocol ══ */}
      <div
        style={{
          background: '#f5f5f5',
          padding: 'clamp(5rem, 8vw, 8rem) 2rem',
          borderTop: `2px solid ${C.black}`,
          borderBottom: `2px solid ${C.black}`,
        }}
      >
        <div style={{ ...WRAP }}>
          <GeoAnnotation n="04" label="The Protocol" color={C.black} />

          <h2
            data-fade
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 'clamp(1.8rem, 4.5vw, 3.5rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.025em',
              textTransform: 'uppercase',
              color: C.black,
              marginBottom: '3rem',
            }}
          >
            The emerging
            <br />
            model of
            <br />
            social
            <br />
            coordination
          </h2>

          <GeoProtocol steps={FLOW} />

          <p data-fade style={P}>
            The human sets the initial judgment and still has the final say. Agents are autonomous in facilitating, not deciding.
          </p>

          <div
            data-fade
            style={{
              margin: '2.5rem 0',
              padding: '2.5rem',
              background: C.white,
              borderLeft: `8px solid ${C.red}`,
            }}
          >
            <p
              style={{
                fontFamily: SANS,
                fontWeight: 300,
                fontSize: 'clamp(1.05rem, 2.2vw, 1.35rem)',
                lineHeight: 1.55,
                color: C.black,
                margin: 0,
              }}
            >
              It's more than training a better model. It's an operating protocol for cooperation—standard procedures for agent-to-agent relationships that let trust compound over time.
            </p>
          </div>
        </div>
      </div>

      {/* ══ SECTION 05 ══ */}
      <div style={{ ...WRAP, padding: '6rem 2rem 6rem' }}>
        <GeoAnnotation n="05" label="Ambient Optimism" color={C.red} />

        <h2
          data-fade
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
            textTransform: 'uppercase',
            color: C.black,
            marginBottom: '2.5rem',
          }}
        >
          Entering
          <br />
          <span style={{ color: C.red }}>Ambient</span>
          <br />
          Optimism
        </h2>

        <p data-fade style={P}>
          We can now realize opportunity value that previously remained latent because of lack of—or failed—coordination. Open up multiverses where you meet the person you just missed.
        </p>

        <p data-fade style={P}>
          We call this <strong style={{ fontWeight: 700 }}>engineering serendipity</strong>. But the feeling it engenders is the powerful part:
        </p>

        {/* Big geometric quote block */}
        <div
          data-fade
          style={{
            margin: '3rem 0',
            display: 'grid',
            gridTemplateColumns: '8px 1fr',
            gap: 0,
          }}
        >
          <div style={{ background: C.black }} />
          <div
            style={{
              background: C.black,
              padding: '3rem',
            }}
          >
            <p
              style={{
                fontFamily: SANS,
                fontWeight: 700,
                fontSize: 'clamp(1.4rem, 3vw, 2.2rem)',
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                color: C.yellow,
                margin: 0,
              }}
            >
              Ambient optimism.
            </p>
            <p
              style={{
                fontFamily: SANS,
                fontWeight: 300,
                fontSize: 'clamp(0.9rem, 1.8vw, 1.1rem)',
                lineHeight: 1.5,
                color: 'rgba(255,255,255,0.6)',
                margin: '0.75rem 0 0',
              }}
            >
              The quiet trust that the right opportunities will find you.
            </p>
          </div>
        </div>

        <p data-fade style={P}>
          Not because you finally nailed your personal brand or figured out the black box algos, but because your intents are out there—the new trading language of agents.
        </p>
      </div>

      {/* ══ CLOSING ══ */}
      <div
        style={{
          background: C.black,
          padding: 'clamp(6rem, 14vw, 14rem) 3rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Geometric background */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '80vw',
            height: '80vw',
            borderRadius: '50%',
            border: `2px solid rgba(230,50,34,0.1)`,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '50vw',
            height: '50vw',
            borderRadius: '50%',
            border: `2px solid rgba(26,76,168,0.15)`,
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div
            style={{
              fontFamily: SANS,
              fontSize: '0.55rem',
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.2)',
              marginBottom: '4rem',
            }}
          >
            — Found in Translation
          </div>
          <p
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 'clamp(3rem, 10vw, 10rem)',
              lineHeight: 0.88,
              letterSpacing: '-0.04em',
              textTransform: 'uppercase',
              color: C.white,
              margin: 0,
            }}
          >
            Your
            <br />
            <span style={{ color: C.red }}>others</span>
            <br />
            are out
            <br />
            there.
          </p>
          <p
            style={{
              fontFamily: SANS,
              fontWeight: 700,
              fontSize: 'clamp(1.2rem, 3vw, 2.5rem)',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
              color: C.yellow,
              marginTop: '2rem',
            }}
          >
            Now they can find you too.
          </p>
        </div>
      </div>

      {/* Bauhaus footer stripe */}
      <div style={{ display: 'flex', height: 8 }}>
        <div style={{ flex: 2, background: C.red }} />
        <div style={{ flex: 1, background: C.yellow }} />
        <div style={{ flex: 3, background: C.blue }} />
        <div style={{ flex: 1, background: C.black }} />
      </div>

      {/* Footer */}
      <footer
        style={{
          padding: '1.5rem 2.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: C.white,
          borderTop: `2px solid ${C.black}`,
        }}
      >
        <Link
          to="/"
          style={{
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: '0.72rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.black,
            textDecoration: 'none',
          }}
        >
          Index Network
        </Link>
        <Link
          to="/blog"
          style={{
            fontFamily: SANS,
            fontSize: '0.72rem',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: C.midGrey,
            textDecoration: 'none',
          }}
        >
          ← Back to Letters
        </Link>
      </footer>
    </div>
  );
}
