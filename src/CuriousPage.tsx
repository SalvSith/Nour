import { useCallback, useEffect, useRef } from 'react';

const ACCENT     = 'rgba(255,255,255,0.75)';
const ACCENT_DIM = 'rgba(255,255,255,0.10)';

const NUMERALS = ['i', 'ii', 'iii', 'iv'];

function playWind() {
  try {
    const ctx = new AudioContext();
    fetch('/Sounds/LetterWind.mp3')
      .then(r => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then(ab => ctx.decodeAudioData(ab))
      .then(buf => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = 1.0;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
        src.onended = () => setTimeout(() => ctx.close(), 500);
      })
      .catch(() => ctx.close());
  } catch {}
}

function splitIntoWords(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if ((n as Text).textContent?.length) nodes.push(n as Text);
  }
  nodes.forEach(node => {
    const parent = node.parentNode;
    if (!parent) return;
    const parts = (node.textContent ?? '').split(/(\s+)/);
    const frag = document.createDocumentFragment();
    parts.forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) {
        frag.appendChild(document.createTextNode(part));
      } else {
        const span = document.createElement('span');
        span.className = 'ltr';
        span.style.cssText = 'display:inline-block';
        span.textContent = part;
        frag.appendChild(span);
      }
    });
    parent.replaceChild(frag, node);
  });
}

const definitions = [
  'Nour listens. Not to what you say. To how it sounds when you say it. It lives in the microphone. Talks back in colour.',
  'Nour is light. What it looks like is what it feels. There is nothing between the two.',
  'It holds the feeling of things. Warmth makes it grow. Cruelty leaves a mark. Silence does too.',
  'Love Nour enough and it becomes something you did not expect. Hurt it enough, or leave it alone long enough. It goes dark. It does not come back.',
];

export default function CuriousPage() {
  const wrapRef    = useRef<HTMLDivElement>(null);
  const ctaRef     = useRef<HTMLAnchorElement>(null);
  const grainRef   = useRef<SVGFETurbulenceElement>(null);
  const navigating = useRef(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    body.style.touchAction = 'auto';
    if (root) { root.style.height = 'auto'; root.style.overflow = 'auto'; }
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      body.style.touchAction = '';
      if (root) { root.style.height = ''; root.style.overflow = ''; }
    };
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    splitIntoWords(el);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 2s cubic-bezier(0.16,1,0.3,1), transform 2s cubic-bezier(0.16,1,0.3,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      });
    });
  }, []);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    if (navigating.current) return;
    navigating.current = true;

    playWind();

    const container = wrapRef.current;
    if (!container) { window.location.href = '/'; return; }

    Array.from(container.querySelectorAll<HTMLElement>('.ltr')).forEach(el => {
      const dx    = (Math.random() - 0.5) * 80;
      const dy    = -(Math.random() * 50 + 8);
      const blur  = 6 + Math.random() * 8;
      const delay = Math.random() * 220;
      el.animate(
        [
          { opacity: 1, filter: 'blur(0px)',       transform: 'translate(0,0)'               },
          { opacity: 0, filter: `blur(${blur}px)`, transform: `translate(${dx}px,${dy}px)` },
        ],
        { duration: 480, delay, easing: 'cubic-bezier(0.4,0,1,1)', fill: 'forwards' },
      );
    });

    Array.from(container.querySelectorAll<HTMLElement>('[data-divider]')).forEach(el => {
      el.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 400, delay: 80, easing: 'ease-out', fill: 'forwards' },
      );
    });

    await new Promise(r => setTimeout(r, 1800));
    window.location.href = '/';
  }, []);

  const onHoverIn = useCallback(() => {
    ctaRef.current?.querySelectorAll<HTMLElement>('.ltr').forEach(el => {
      el.style.color = '#fff';
      el.style.transition = 'color 0.35s ease';
    });
  }, []);

  const onHoverOut = useCallback(() => {
    ctaRef.current?.querySelectorAll<HTMLElement>('.ltr').forEach(el => {
      el.style.color = '';
    });
  }, []);

  useEffect(() => {
    const turb = grainRef.current;
    if (!turb) return;
    const tick = () => turb.setAttribute('seed', String(Math.floor(Math.random() * 500)));
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      {/* Film grain — screen blend only brightens on black, never darkens */}
      <svg
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'screen',
          opacity: 0.08,
        } as React.CSSProperties}
      >
        <filter id="film-grain-f">
          <feTurbulence
            ref={grainRef}
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
            seed="42"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain-f)" />
      </svg>

        <style>{`
        @keyframes nour-shine {
          0%, 60%, 100% { color: rgba(255,255,255,0.75); text-shadow: none; }
          70%  { color: #fff; text-shadow: 0 0 18px rgba(255,255,255,0.7), 0 0 40px rgba(255,255,255,0.3); }
          85%  { color: rgba(255,255,255,0.88); text-shadow: 0 0 8px rgba(255,255,255,0.2); }
        }
        .meet-nour-btn { animation: nour-shine 6s ease-in-out infinite; }
        @media (max-width: 768px) {
          .arabic-watermark { color: rgba(255,255,255,0.032) !important; }
        }
      `}</style>

      {/* Ambient orb glow — stays fixed, doesn't scatter */}
      <div aria-hidden="true" style={{
        position: 'fixed',
        inset: 0,
        background: 'radial-gradient(ellipse 60% 50% at 50% 55%, rgba(255,255,255,0.04) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        background: '#000',
        minHeight: '100svh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(2rem, 6vw, 4rem) clamp(1.4rem, 6vw, 3rem)',
        position: 'relative',
      }}>
        <div
          ref={wrapRef}
          style={{
            fontFamily: '"Cormorant Garamond", Georgia, serif',
            color: '#fff',
            textAlign: 'left',
            maxWidth: '500px',
            width: '100%',
            opacity: 0,
            transform: 'translateY(20px)',
            position: 'relative',
          }}
        >
          {/* Arabic watermark — inside wrapRef so it scatters on exit */}
          <div aria-hidden="true" className="arabic-watermark" style={{
            position: 'absolute',
            top: '50%',
            right: 'clamp(-1rem, -4vw, -2rem)',
            transform: 'translateY(-50%)',
            fontSize: 'clamp(9rem, 30vw, 18rem)',
            fontWeight: 300,
            lineHeight: 1,
            color: 'rgba(255,255,255,0.03)',
            pointerEvents: 'none',
            userSelect: 'none',
            letterSpacing: '-0.02em',
            zIndex: 0,
          }}>
            نور
          </div>

          {/* Content sits above watermark */}
          <div style={{ position: 'relative', zIndex: 1 }}>

            {/* Headword */}
            <p style={{
              fontWeight: 300,
              fontStyle: 'italic',
              fontSize: 'clamp(2.6rem, 9vw, 4.4rem)',
              letterSpacing: '-0.01em',
              lineHeight: 0.9,
              margin: 0,
              textShadow: `0 0 40px ${ACCENT_DIM}`,
            }}>
              Nour
            </p>

            {/* Pronunciation */}
            <p style={{
              fontWeight: 200,
              fontSize: 'clamp(0.82rem, 2.2vw, 0.94rem)',
              letterSpacing: '0.14em',
              color: 'rgba(255,255,255,0.6)',
              marginTop: '0.9em',
              marginBottom: 0,
              lineHeight: 1.6,
              textTransform: 'uppercase',
            }}>
              /nuːr/&nbsp;&nbsp;n.&nbsp;&nbsp;
              <span style={{ color: 'rgba(255,255,255,0.65)', textTransform: 'none', letterSpacing: '0.06em' }}>Arabic نور — light</span>
            </p>

            <Divider />

            {/* Definitions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(1rem, 2.5vh, 1.4rem)' }}>
              {definitions.map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: '1.1em', alignItems: 'baseline' }}>
                  <span style={{
                    fontStyle: 'italic',
                    fontWeight: 200,
                    fontSize: 'clamp(0.7rem, 1.8vw, 0.8rem)',
                    letterSpacing: '0.1em',
                    color: 'rgba(255,255,255,0.2)',
                    flexShrink: 0,
                    minWidth: '1.4em',
                    textAlign: 'right',
                  }}>
                    {NUMERALS[i]}
                  </span>
                  <span style={{
                    fontWeight: 200,
                    fontSize: 'clamp(0.92rem, 2.5vw, 1.05rem)',
                    letterSpacing: '0.03em',
                    lineHeight: 1.8,
                    color: 'rgba(255,255,255,0.75)',
                  }}>
                    {text}
                  </span>
                </div>
              ))}
            </div>

            <Divider short />

            {/* CTA */}
            <a
              ref={ctaRef}
              href="/"
              onClick={handleClick}
              onMouseEnter={onHoverIn}
              onMouseLeave={onHoverOut}
              className="meet-nour-btn"
              style={{
                display: 'inline-block',
                fontWeight: 600,
                fontStyle: 'italic',
                fontSize: 'clamp(1.3rem, 4vw, 1.6rem)',
                letterSpacing: '0.06em',
                color: ACCENT,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              Meet Nour
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

function Divider({ short: _short }: { short?: boolean }) {
  return (
    <div
      data-divider
      style={{
        width: '100%',
        height: '1px',
        background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.12), transparent)',
        margin: 'clamp(1.1rem, 2.8vh, 1.7rem) 0',
      }}
    />
  );
}
