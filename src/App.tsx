/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { triggerAppDebugApkDownload } from './apkBuilder';

const VIDEO_URL = 'https://thinkingods.com/demos/kingfisher-hero/hero.mp4';
const REVEAL_AT = 4.3; // seconds; the moment the bird lands

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const headCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const wingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const belowFoldRef = useRef<HTMLElement | null>(null);

  const [isRevealed, setIsRevealed] = useState(false);
  const [thumbsDrawn, setThumbsDrawn] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'complete'>('idle');
  const [activeModal, setActiveModal] = useState<'none' | 'prompt' | 'build' | 'manifest'>('none');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Sample 1x1 pixel from top-right (94% x, 12% y) of the video to match --bg and --ghost
  const sampleVideoBackdrop = useCallback((video: HTMLVideoElement) => {
    try {
      if (!video.videoWidth || !video.videoHeight) return;
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const sx = Math.floor(video.videoWidth * 0.94);
      const sy = Math.floor(video.videoHeight * 0.12);
      ctx.drawImage(video, sx, sy, 1, 1, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      if (r === 0 && g === 0 && b === 0) return;
      const bgCss = `rgb(${r}, ${g}, ${b})`;
      const gr = Math.round(r * 0.955);
      const gg = Math.round(g * 0.955);
      const gb = Math.round(b * 0.955);
      const ghostCss = `rgb(${gr}, ${gg}, ${gb})`;
      document.documentElement.style.setProperty('--bg', bgCss);
      document.documentElement.style.setProperty('--ghost', ghostCss);
    } catch {
      // Cross-origin or file:// pixel readback falls back to :root CSS tokens (#B6C3B0 & #ADBAA7)
    }
  }, []);

  // Draw fractional crops of the video frame into the two dark card <canvas> elements
  const drawVideoCrops = useCallback((video: HTMLVideoElement) => {
    const drawCrop = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return;
      const cropAttr = canvas.getAttribute('data-crop');
      if (!cropAttr) return;
      const [fx, fy, fsize] = cropAttr.split(',').map(Number);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;

      canvas.width = 320;
      canvas.height = 320;

      try {
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const sx = vw * fx;
          const sy = vh * fy;
          const sWidth = vw * fsize;
          const sHeight = vw * fsize;
          ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, 320, 320);
          setThumbsDrawn(true);
          return;
        }
      } catch {
        // Fallback illustration if video drawImage is unavailable
      }

      // Stylized fallback crop if video frame not ready
      const grad = ctx.createRadialGradient(160, 140, 20, 160, 160, 200);
      grad.addColorStop(0, '#0E7C86');
      grad.addColorStop(0.55, '#E8732A');
      grad.addColorStop(1, '#0F1D1C');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 320, 320);
      setThumbsDrawn(true);
    };

    drawCrop(headCanvasRef.current);
    drawCrop(wingCanvasRef.current);
  }, []);

  // Trigger the hero reveal and crop thumbnails
  const triggerReveal = useCallback(() => {
    setIsRevealed((prev) => {
      if (!prev && videoRef.current) {
        drawVideoCrops(videoRef.current);
      }
      return true;
    });
  }, [drawVideoCrops]);

  // Video choreography & failsafe lifecycle
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      const onLoadedMeta = () => {
        if (video.duration && Number.isFinite(video.duration)) {
          video.currentTime = Math.max(0, video.duration - 0.1);
        }
        sampleVideoBackdrop(video);
        drawVideoCrops(video);
        setIsRevealed(true);
      };
      if (video.readyState >= 1) {
        onLoadedMeta();
      } else {
        video.addEventListener('loadedmetadata', onLoadedMeta, { once: true });
      }
      setIsRevealed(true);
      return;
    }

    // Hard 9s timeout so the hero is never left blank
    const hardTimeout = window.setTimeout(() => {
      triggerReveal();
    }, 9000);

    const startPlayback = () => {
      sampleVideoBackdrop(video);
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          triggerReveal();
        });
      }
    };

    const handleLoadedData = () => {
      startPlayback();
    };

    const handleTimeUpdate = () => {
      if (video.currentTime >= REVEAL_AT) {
        triggerReveal();
      }
    };

    const handleEnded = () => {
      triggerReveal();
      drawVideoCrops(video);
    };

    const handleError = () => {
      triggerReveal();
    };

    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('ended', handleEnded);
    video.addEventListener('error', handleError);

    // If readyState >= 2 when the script runs, start immediately
    if (video.readyState >= 2) {
      startPlayback();
    }

    return () => {
      window.clearTimeout(hardTimeout);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('error', handleError);
    };
  }, [sampleVideoBackdrop, drawVideoCrops, triggerReveal]);

  // IntersectionObserver at threshold .18 for Below the Fold elements
  useEffect(() => {
    const section = belowFoldRef.current;
    if (!section) return;

    const targets = section.querySelectorAll('.scroll-rv');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.18 }
    );

    targets.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  // Replay choreography handler
  const handleReplay = () => {
    const video = videoRef.current;
    setIsRevealed(false);
    setThumbsDrawn(false);

    if (video) {
      video.currentTime = 0;
      const p = video.play();
      if (p !== undefined) {
        p.catch(() => {
          triggerReveal();
        });
      }
    }
  };

  // Download APK handler
  const handleDownloadApk = () => {
    setDownloadStatus('downloading');
    triggerAppDebugApkDownload();
    window.setTimeout(() => {
      setDownloadStatus('complete');
      window.setTimeout(() => setDownloadStatus('idle'), 4000);
    }, 600);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleCopyPrompt = () => {
    const promptText = `Set "Kingfisher" ("fisher" in italic) in Instrument Serif at clamp(90px, 17vw, 300px), top: 13vh, color #ADBAA7 on #B6C3B0 with mix-blend-mode: darken. Choreography: const REVEAL_AT = 4.3; sample 94% x, 12% y on loadeddata to sync --bg and --ghost.`;
    navigator.clipboard?.writeText(promptText);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 2500);
  };

  return (
    <div>
      {/* HERO SECTION (100svh, overflow hidden) */}
      <section className={`hero-section ${isRevealed ? 'is-revealed' : ''}`}>
        {/* Background Video — no loop, final frame holds once finished */}
        <video
          ref={videoRef}
          className="hero-video"
          src={VIDEO_URL}
          muted
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />

        {/* Giant Word sitting BEHIND the bird via mix-blend-mode: darken */}
        <div className="hero-giant-word" aria-hidden="true">
          King<em>fisher</em>
        </div>

        {/* Legibility Overlay */}
        <div className="hero-overlay" />

        {/* Top Navigation (stagger --d: 0) */}
        <header
          className="hero-nav rv"
          style={{ '--d': 0 } as React.CSSProperties}
        >
          <a href="#top" className="brand-mark">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              {/* Small two-tone bird mark (teal body/wing + orange breast/beak) */}
              <path
                d="M3 14C6.5 9.5 11.2 7 16.5 7L22 5.5L18.5 9.5C19.5 12.5 17.5 16.5 13.5 18.5L3 14Z"
                fill="#0E7C86"
              />
              <path
                d="M7.5 16L13.5 18.5C16.2 17.2 18 14.5 18.2 11.8C14.8 12.2 10.8 13.8 7.5 16Z"
                fill="#E8732A"
              />
            </svg>
            <span>AURA (KINGFISHER) WEATHER APP</span>
          </a>

          <nav className="nav-center-links" aria-label="Primary Navigation">
            <button type="button" onClick={() => scrollToSection('field-notes')}>
              LIBRARY
            </button>
            <span className="nav-sep">·</span>
            <button type="button" onClick={() => scrollToSection('apk-download-section')}>
              WEATHER APK
            </button>
            <span className="nav-sep">·</span>
            <button type="button" onClick={() => setActiveModal('prompt')}>
              PROMPTS
            </button>
            <span className="nav-sep">·</span>
            <button type="button" onClick={() => scrollToSection('stats-band')}>
              TELEMETRY
            </button>
          </nav>

          <div className="nav-right">
            <button
              type="button"
              className="nav-signin"
              onClick={() => setActiveModal('manifest')}
            >
              SIGN IN
            </button>
            <button
              type="button"
              className="pill-dark"
              onClick={() => scrollToSection('apk-download-section')}
            >
              GET APK
            </button>
          </div>
        </header>

        {/* Hero Center Split */}
        <div className="hero-main">
          {/* Left Copy */}
          <div className="hero-left">
            <div
              className="eyebrow-row rv"
              style={{ '--d': 1 } as React.CSSProperties}
            >
              <span className="eyebrow-rule" />
              <span className="eyebrow-text">CINEMATIC PROMPT LIBRARY · WEATHER APK</span>
            </div>

            <h1
              className="hero-h1 rv"
              style={{ '--d': 2 } as React.CSSProperties}
            >
              Websites that <em>land</em> with precision
            </h1>

            <p
              className="hero-lede rv"
              style={{ '--d': 3 } as React.CSSProperties}
            >
              Choreographed motion prompts and our native Android weather instrument
              built around real footage, zero per-frame masking, and barometric
              accuracy that settles on the exact frame.
            </p>

            <div
              className="hero-cta-row rv"
              style={{ '--d': 4 } as React.CSSProperties}
            >
              <button
                type="button"
                className="cta-orange-pill"
                onClick={handleDownloadApk}
              >
                <span>
                  {downloadStatus === 'downloading'
                    ? 'Packaging app-debug.apk…'
                    : downloadStatus === 'complete'
                    ? 'Downloaded app-debug.apk ✓'
                    : 'Download Weather APK'}
                </span>
                <span className="cta-arrow-circle" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12l7 7 7-7" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="cta-watch-link"
                onClick={() => setActiveModal('build')}
              >
                Watch a build ↗
              </button>
            </div>
          </div>

          {/* Right Cluster — Stylish 4-Line AURA APK Feature Ledger */}
          <div className="hero-right">
            <div
              className="aura-lines-card rv"
              style={{ '--d': 5 } as React.CSSProperties}
            >
              <div className="aura-lines-header">
                <span>
                  AURA — HAUTE ATMOSPHERIC
                  <br />
                  OBSERVATORY
                </span>
                <span style={{ textAlign: 'right' }}>
                  APK
                  <br />
                  V2.4
                </span>
              </div>

              <ul className="aura-four-lines">
                <li
                  className="aura-line-item rv"
                  style={{ '--d': 6 } as React.CSSProperties}
                >
                  <span className="aura-line-num">01</span>
                  <div>
                    <span className="aura-line-text">
                      Dynamic <em>live weather</em> physics &amp; barometric telemetry
                    </span>
                    <span className="aura-line-sub">
                      Real-time atmospheric computation with reactive glassmorphic surfaces.
                    </span>
                  </div>
                </li>

                <li
                  className="aura-line-item rv"
                  style={{ '--d': 7 } as React.CSSProperties}
                >
                  <span className="aura-line-num">02</span>
                  <div>
                    <span className="aura-line-text">
                      Precision <em>celestial dials</em> &amp; solar-lunar progression
                    </span>
                    <span className="aura-line-sub">
                      Interactive horizon arcs tracking golden hour, zenith, and twilight phases.
                    </span>
                  </div>
                </li>

                <li
                  className="aura-line-item rv"
                  style={{ '--d': 8 } as React.CSSProperties}
                >
                  <span className="aura-line-num">03</span>
                  <div>
                    <span className="aura-line-text">
                      Bespoke acoustic <em>soundscapes</em> tuned to local skies
                    </span>
                    <span className="aura-line-sub">
                      Ambient rainfall, wind timbre, and pressure-reactive audio synthesis.
                    </span>
                  </div>
                </li>

                <li
                  className="aura-line-item rv"
                  style={{ '--d': 9 } as React.CSSProperties}
                >
                  <span className="aura-line-num">04</span>
                  <div>
                    <span className="aura-line-text">
                      <em>Concierge</em> meteorology &amp; pinned mobile widgets
                    </span>
                    <span className="aura-line-sub">
                      Hyper-local vicinity alerts and customizable Android home-screen dials.
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Strip (stagger --d: 8) */}
        <footer
          className="hero-bottom-strip rv"
          style={{ '--d': 8 } as React.CSSProperties}
        >
          <div className="strip-left">
            <span>SPECIES 01</span>
            <em>Alcedo atthis</em>
          </div>

          <div className="strip-center">DELHI NCR · 28.61° N</div>

          <button
            type="button"
            className="frosted-replay-pill"
            onClick={handleReplay}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span>REPLAY LANDING</span>
          </button>
        </footer>
      </section>

      {/* BELOW THE FOLD: "Why a Kingfisher" + APK Download Hub */}
      <section
        id="field-notes"
        ref={belowFoldRef}
        className="field-notes-section"
      >
        <div className="field-notes-container">
          {/* Two-Column Header */}
          <div className="notes-header-grid">
            <div
              className="scroll-rv"
              style={{ '--sd': 0 } as React.CSSProperties}
            >
              <div className="notes-kicker">
                <span className="num-orange">02</span> FIELD NOTES — WHY A KINGFISHER
              </div>
              <h2 className="notes-h2">
                It waits, reads the water, then lands in one clean motion
              </h2>
            </div>

            <div
              className="scroll-rv"
              style={{ '--sd': 1 } as React.CSSProperties}
            >
              <p className="notes-header-p">
                Most interfaces clutter the viewport before the subject has even
                arrived. Like <em>Alcedo atthis</em>, our prompt architecture and
                companion Android weather application hold completely still—reading
                atmospheric pressure, refraction, and wind shear—before executing a
                single, zero-splash landing.
              </p>
            </div>
          </div>

          {/* Bento Grid (1.35fr 1fr 1fr, 16px gap) */}
          <div className="bento-grid">
            {/* Note 01: Dark Card Spanning Two Rows on the Beak that Reshaped the Shinkansen */}
            <article
              className="bento-card-dark scroll-rv"
              style={{ '--sd': 1 } as React.CSSProperties}
            >
              <div>
                <div className="note-index">
                  <span>NOTE 01 · HYDRODYNAMICS</span>
                  <span style={{ color: 'var(--orange)' }}>500 SERIES</span>
                </div>
                <h3 className="note-title">
                  The beak that reshaped the Shinkansen
                </h3>
                <p className="note-body">
                  When Eiji Nakatsu needed to eliminate the sonic boom of bullet
                  trains entering tunnels at 300 km/h, he modelled the nose cone on
                  the kingfisher’s wedge-shaped bill. It transitions between air and
                  water—two media of radically different density—with virtually zero
                  compression wave.
                </p>
              </div>

              {/* Self-drawing SVG dive arc from PERCH to ENTRY */}
              <div style={{ marginTop: '28px' }}>
                <svg
                  viewBox="0 0 360 150"
                  width="100%"
                  height="150"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Kingfisher dive trajectory from perch to water entry"
                >
                  {/* Waterline */}
                  <line
                    x1="16"
                    y1="122"
                    x2="344"
                    y2="122"
                    stroke="rgba(227,232,222,0.16)"
                    strokeDasharray="4 4"
                  />
                  {/* Self-drawing dive arc */}
                  <path
                    className="dive-arc-path"
                    d="M 34 26 C 145 26, 235 52, 312 122"
                    stroke="#E8732A"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Perch Node */}
                  <circle cx="34" cy="26" r="5" fill="#E3E8DE" />
                  <text
                    x="48"
                    y="30"
                    fill="rgba(227,232,222,0.75)"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="10"
                    letterSpacing="1.6"
                  >
                    PERCH · 4.3s
                  </text>
                  {/* Entry Node */}
                  <circle cx="312" cy="122" r="5.5" fill="#E8732A" />
                  <circle
                    cx="312"
                    cy="122"
                    r="12"
                    stroke="#0E7C86"
                    strokeWidth="1.2"
                    opacity="0.7"
                  />
                  <text
                    x="224"
                    y="142"
                    fill="#E8732A"
                    fontFamily="JetBrains Mono, monospace"
                    fontSize="10"
                    letterSpacing="1.6"
                  >
                    ENTRY · 0 SPLASH
                  </text>
                </svg>
              </div>
            </article>

            {/* Note 02: Light Card on Structural Colour with Three Swatch Chips */}
            <article
              className="bento-card-light scroll-rv"
              style={{ '--sd': 2 } as React.CSSProperties}
            >
              <div>
                <div className="note-index">
                  <span>NOTE 02 · OPTICS</span>
                  <span>NANOPHOTONICS</span>
                </div>
                <h3 className="note-title">
                  Structural colour, not pigment
                </h3>
                <p className="note-body">
                  The electric cyan along the back feathers contains zero blue
                  pigment. Spongy keratin nanostructures scatter coherent light
                  wavelengths—just like our runtime canvas sampler adapts to any
                  ambient backdrop.
                </p>
              </div>

              {/* Three Swatch Chips */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '10px',
                  marginTop: '24px',
                }}
              >
                <div
                  style={{
                    background: '#0E7C86',
                    color: '#E3E8DE',
                    padding: '12px 10px',
                    borderRadius: '12px',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                  }}
                >
                  <div>#0E7C86</div>
                  <div style={{ opacity: 0.7, marginTop: '4px' }}>TEAL</div>
                </div>
                <div
                  style={{
                    background: '#E8732A',
                    color: '#10201F',
                    padding: '12px 10px',
                    borderRadius: '12px',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                  }}
                >
                  <div>#E8732A</div>
                  <div style={{ opacity: 0.75, marginTop: '4px' }}>OCHRE</div>
                </div>
                <div
                  style={{
                    background: '#B6C3B0',
                    color: '#10201F',
                    border: '1px solid var(--line)',
                    padding: '12px 10px',
                    borderRadius: '12px',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                  }}
                >
                  <div>#B6C3B0</div>
                  <div style={{ opacity: 0.7, marginTop: '4px' }}>SAGE</div>
                </div>
              </div>
            </article>

            {/* Note 03: Light Card on the Nictitating Membrane */}
            <article
              className="bento-card-light scroll-rv"
              style={{ '--sd': 3 } as React.CSSProperties}
            >
              <div>
                <div className="note-index">
                  <span>NOTE 03 · REFRACTION</span>
                  <span>DUAL FOVEA</span>
                </div>
                <h3 className="note-title">
                  The nictitating membrane
                </h3>
                <p className="note-body">
                  As the bird hits the surface, a translucent third eyelid sweeps
                  across the cornea, acting as a corrective contact lens while egg-shaped
                  retinal cones compensate for Snell’s window refraction.
                </p>
              </div>

              <div
                style={{
                  marginTop: '24px',
                  paddingTop: '14px',
                  borderTop: '1px solid var(--line)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontFamily: 'var(--mono)',
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  color: 'var(--ink-2)',
                }}
              >
                <span>INDEX n = 1.333</span>
                <span style={{ color: 'var(--teal)' }}>LOCKED FOCUS</span>
              </div>
            </article>

            {/* Note 04: Light Card Spanning Two Columns on Waiting Still, with SVG Eye/Target */}
            <article
              className="bento-card-light span-2-cols scroll-rv"
              style={{ '--sd': 4 } as React.CSSProperties}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '24px',
                }}
              >
                <div style={{ maxWidth: '460px' }}>
                  <div className="note-index">
                    <span>NOTE 04 · STILLNESS</span>
                    <span>CHOREOGRAPHY 4.3S</span>
                  </div>
                  <h3 className="note-title">
                    The discipline of waiting still
                  </h3>
                  <p className="note-body">
                    Nothing typographic moves on this page until the kingfisher
                    settles on the twig at <code>REVEAL_AT = 4.3</code>. Head
                    stabilisation locks to within a fraction of a millimetre while
                    the branch sways underneath.
                  </p>
                </div>

                {/* SVG Eye / Target */}
                <div style={{ flexShrink: 0, margin: '0 auto' }}>
                  <svg
                    width="124"
                    height="124"
                    viewBox="0 0 124 124"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-label="Precision optical target reticle"
                  >
                    <circle
                      cx="62"
                      cy="62"
                      r="54"
                      stroke="rgba(16,32,31,0.18)"
                      strokeWidth="1"
                    />
                    <circle
                      cx="62"
                      cy="62"
                      r="38"
                      stroke="#0E7C86"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                    />
                    <path
                      d="M16 62C30 40 50 32 62 32C74 32 94 40 108 62C94 84 74 92 62 92C50 92 30 84 16 62Z"
                      stroke="#10201F"
                      strokeWidth="1.5"
                    />
                    <circle cx="62" cy="62" r="14" fill="#10201F" />
                    <circle cx="62" cy="62" r="5" fill="#E8732A" />
                    <line
                      x1="62"
                      y1="2"
                      x2="62"
                      y2="18"
                      stroke="rgba(16,32,31,0.35)"
                    />
                    <line
                      x1="62"
                      y1="106"
                      x2="62"
                      y2="122"
                      stroke="rgba(16,32,31,0.35)"
                    />
                    <line
                      x1="2"
                      y1="62"
                      x2="18"
                      y2="62"
                      stroke="rgba(16,32,31,0.35)"
                    />
                    <line
                      x1="106"
                      y1="62"
                      x2="122"
                      y2="62"
                      stroke="rgba(16,32,31,0.35)"
                    />
                  </svg>
                </div>
              </div>
            </article>
          </div>

          {/* Dark Stats Band Split Into Four by Faint Dividers */}
          <div
            id="stats-band"
            className="stats-band scroll-rv"
            style={{ '--sd': 2 } as React.CSSProperties}
          >
            {/* Stat 1: LENGTH 16 cm with ruler that fills to 80% */}
            <div className="stat-cell">
              <div className="stat-label">LENGTH · BILL TO TAIL</div>
              <div className="stat-value">16 cm</div>
              <div>
                <div className="ruler-track">
                  <div className="ruler-fill" />
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '6px',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    opacity: 0.5,
                  }}
                >
                  <span>0</span>
                  <span>80% SPAN</span>
                  <span>20 cm</span>
                </div>
              </div>
            </div>

            {/* Stat 2: WEIGHT ~40 g with a solid circle beside a dashed one */}
            <div className="stat-cell">
              <div className="stat-label">WEIGHT · MASS</div>
              <div className="stat-value">~40 g</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                <svg width="64" height="28" viewBox="0 0 64 28" fill="none">
                  <circle cx="14" cy="14" r="11" fill="#E8732A" />
                  <circle
                    cx="46"
                    cy="14"
                    r="11"
                    stroke="rgba(227,232,222,0.45)"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                </svg>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                    opacity: 0.6,
                  }}
                >
                  HOLLOW BONE
                </span>
              </div>
            </div>

            {/* Stat 3: COLOUR Zero with a shimmering teal-to-cobalt bar */}
            <div className="stat-cell">
              <div className="stat-label">COLOUR · PIGMENT</div>
              <div className="stat-value">Zero</div>
              <div>
                <div className="structural-colour-bar" />
                <div
                  style={{
                    marginTop: '6px',
                    fontFamily: 'var(--mono)',
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                    opacity: 0.55,
                  }}
                >
                  475nm COHERENT SCATTER
                </div>
              </div>
            </div>

            {/* Stat 4: STRIKE "One dive" in italic orange with a self-drawing curve */}
            <div className="stat-cell">
              <div className="stat-label">STRIKE · PRECISION</div>
              <div className="stat-value italic-orange">One dive</div>
              <div>
                <svg width="100%" height="26" viewBox="0 0 180 26" fill="none">
                  <path
                    className="strike-curve-path"
                    d="M 4 22 Q 70 2, 176 18"
                    stroke="#E8732A"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* APK DOWNLOAD SECTION (with attached app-debug.apk) */}
          <div
            id="apk-download-section"
            className="apk-download-hub scroll-rv"
            style={{ '--sd': 3 } as React.CSSProperties}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--orange)',
                  marginBottom: '14px',
                }}
              >
                03 ANDROID RELEASE — AURA | HAUTE ATMOSPHERIC OBSERVATORY
              </div>
              <h3
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 'clamp(34px, 4vw, 56px)',
                  lineHeight: 0.98,
                  color: 'var(--paper)',
                  marginBottom: '16px',
                }}
              >
                Aura (Kingfisher) Weather App{' '}
                <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
                  app-debug.apk
                </em>
              </h3>
              <p
                style={{
                  fontFamily: 'var(--sans)',
                  fontSize: '15px',
                  lineHeight: 1.65,
                  color: 'rgba(227, 232, 222, 0.78)',
                  maxWidth: '520px',
                  marginBottom: '26px',
                }}
              >
                Ultra-luxury atmospheric observatory with dynamic live weather
                physics, precision celestial dials, acoustic soundscapes, and
                concierge meteorology. Packaged with the offline-ready Android
                bundle (<code>assets/www/assets/index-DvBx3Amu.js</code>) and
                customizable mobile home-screen widgets.
              </p>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="cta-orange-pill"
                  onClick={handleDownloadApk}
                >
                  <span>
                    {downloadStatus === 'downloading'
                      ? 'Downloading app-debug.apk…'
                      : downloadStatus === 'complete'
                      ? 'app-debug.apk Saved ✓'
                      : 'Download app-debug.apk'}
                  </span>
                  <span className="cta-arrow-circle" aria-hidden="true">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14M5 12l7 7 7-7" />
                    </svg>
                  </span>
                </button>

                <button
                  type="button"
                  className="pill-dark"
                  style={{ background: 'var(--panel-2)' }}
                  onClick={() => setActiveModal('manifest')}
                >
                  INSPECT APK CONTENTS
                </button>
              </div>
            </div>

            {/* Right APK File Package Card */}
            <div className="apk-file-card">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10px',
                    letterSpacing: '0.16em',
                    color: 'var(--orange)',
                  }}
                >
                  VERIFIED ANDROID PACKAGE
                </span>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: '10px',
                    letterSpacing: '0.14em',
                    color: 'rgba(227,232,222,0.55)',
                  }}
                >
                  API 26+ (ANDROID 8.0+)
                </span>
              </div>

              <div>
                <div className="apk-spec-row">
                  <span style={{ opacity: 0.65 }}>File Name</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                    app-debug.apk
                  </span>
                </div>
                <div className="apk-spec-row">
                  <span style={{ opacity: 0.65 }}>Core Bundle</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                    index-DvBx3Amu.js
                  </span>
                </div>
                <div className="apk-spec-row">
                  <span style={{ opacity: 0.65 }}>PWA Icons</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>
                    pwa-192x192.png · favicon.ico
                  </span>
                </div>
                <div className="apk-spec-row">
                  <span style={{ opacity: 0.65 }}>SHA-256 Checksum</span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: '11px',
                      color: 'var(--teal)',
                    }}
                  >
                    8f94e456…d1098e6a
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadApk}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(14, 124, 134, 0.22)',
                  border: '1px solid rgba(14, 124, 134, 0.5)',
                  color: 'var(--paper)',
                  fontFamily: 'var(--mono)',
                  fontSize: '10px',
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                DIRECT MIRROR · DOWNLOAD APK NOW
              </button>
            </div>
          </div>

          {/* Closing Serif Line & Orange CTA */}
          <div
            className="closing-cta-block scroll-rv"
            style={{ '--sd': 4 } as React.CSSProperties}
          >
            <p className="closing-serif-line">
              Wait for the water to clear, then ship in{' '}
              <em style={{ fontStyle: 'italic', color: 'var(--teal)' }}>
                one clean motion
              </em>
              .
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                flexWrap: 'wrap',
                justifyContent: 'center',
              }}
            >
              <button
                type="button"
                className="cta-orange-pill"
                onClick={handleDownloadApk}
              >
                <span>Download app-debug.apk</span>
                <span className="cta-arrow-circle" aria-hidden="true">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12h14M13 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
              <button
                type="button"
                className="pill-dark"
                onClick={() => setActiveModal('prompt')}
              >
                COPY HERO PROMPT & TIMING
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* MODAL: Prompt & REVEAL_AT Documentation */}
      {activeModal !== 'none' && (
        <div
          className="modal-backdrop"
          onClick={() => setActiveModal('none')}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="modal-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--mono)',
                  fontSize: '10px',
                  letterSpacing: '0.18em',
                  color: 'var(--orange)',
                }}
              >
                {activeModal === 'prompt'
                  ? 'KINGFISHER CHOREOGRAPHY & PROMPT'
                  : activeModal === 'build'
                  ? 'HOW THE MIX-BLEND-MODE TRICK WORKS'
                  : 'APK PACKAGE ARCHIVE MANIFEST'}
              </span>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--paper)',
                  fontFamily: 'var(--mono)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  opacity: 0.7,
                }}
              >
                CLOSE ✕
              </button>
            </div>

            {activeModal === 'prompt' && (
              <div>
                <h4
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: '32px',
                    marginBottom: '12px',
                  }}
                >
                  Timing the landing with <code>REVEAL_AT = 4.3</code>
                </h4>
                <p
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.6,
                    opacity: 0.82,
                    marginBottom: '16px',
                  }}
                >
                  In this clip, the kingfisher touches down on the twig at{' '}
                  <strong>4.3 seconds</strong>. If you swap in your own clip where
                  the subject lands at a different second, change the single
                  constant <code>const REVEAL_AT = 4.3;</code> at the top of the
                  script—every staggered reveal (<code>calc(var(--d) * 90ms)</code>)
                  and canvas thumbnail crop is timed off that one number.
                </p>
                <div
                  style={{
                    background: 'var(--panel-2)',
                    padding: '14px',
                    borderRadius: '14px',
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    lineHeight: 1.6,
                    marginBottom: '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div>const REVEAL_AT = 4.3; // Change to the second your bird lands</div>
                  <div>// Runtime sampler reads (94% x, 12% y) on loadeddata</div>
                  <div>// Sets --bg and --ghost = --bg × 0.955</div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type="button"
                    className="cta-orange-pill"
                    onClick={handleCopyPrompt}
                  >
                    <span>
                      {copiedPrompt ? 'Copied to Clipboard ✓' : 'Copy Spec Snippet'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pill-dark"
                    style={{ background: 'var(--panel-2)' }}
                    onClick={() => {
                      setActiveModal('none');
                      handleReplay();
                    }}
                  >
                    REPLAY 4.3S CHOREOGRAPHY
                  </button>
                </div>
              </div>
            )}

            {activeModal === 'build' && (
              <div>
                <h4
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: '32px',
                    marginBottom: '12px',
                  }}
                >
                  Why the bird flies in front of the giant word
                </h4>
                <p
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.65,
                    opacity: 0.85,
                    marginBottom: '16px',
                  }}
                >
                  1. <strong>Zero Masking:</strong> The giant word “King<em>fisher</em>”
                  is set in <code>#ADBAA7</code> over the <code>#B6C3B0</code> sage
                  backdrop with <code>mix-blend-mode: darken</code>. At every pixel,
                  the browser keeps the darker of the word and the video. Because the
                  kingfisher and twig are darker than the word everywhere, the bird
                  wins and appears in front of the typography with no alpha channel
                  or rotoscoping.
                </p>
                <p
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.65,
                    opacity: 0.85,
                    marginBottom: '20px',
                  }}
                >
                  2. <strong>Live Frame Cropping:</strong> Once{' '}
                  <code>currentTime &gt;= 4.3</code>, both dark cards execute{' '}
                  <code>ctx.drawImage(video, ...)</code> using fractional coordinates{' '}
                  <code>0.555,0.335,0.22</code> (head) and{' '}
                  <code>0.43,0.60,0.24</code> (wing) from the video’s own perched
                  frame.
                </p>
                <button
                  type="button"
                  className="cta-orange-pill"
                  onClick={() => {
                    setActiveModal('none');
                    handleReplay();
                  }}
                >
                  <span>Replay & Watch the Blend</span>
                </button>
              </div>
            )}

            {activeModal === 'manifest' && (
              <div>
                <h4
                  style={{
                    fontFamily: 'var(--serif)',
                    fontSize: '32px',
                    marginBottom: '12px',
                  }}
                >
                  Attached <code>app-debug.apk</code> Package Structure
                </h4>
                <p
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.6,
                    opacity: 0.82,
                    marginBottom: '14px',
                  }}
                >
                  The attached weather application APK includes the following
                  verified assets bundled for immediate Android installation:
                </p>
                <div
                  style={{
                    background: 'var(--panel-2)',
                    padding: '14px',
                    borderRadius: '14px',
                    fontFamily: 'var(--mono)',
                    fontSize: '11px',
                    lineHeight: 1.75,
                    marginBottom: '18px',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div>├── AndroidManifest.xml</div>
                  <div>├── assets/www/index.html</div>
                  <div>├── assets/www/assets/index-DvBx3Amu.js</div>
                  <div>├── assets/www/favicon.ico</div>
                  <div>├── assets/www/pwa-192x192.png</div>
                  <div>└── META-INF/MANIFEST.MF</div>
                </div>
                <button
                  type="button"
                  className="cta-orange-pill"
                  onClick={() => {
                    handleDownloadApk();
                    setActiveModal('none');
                  }}
                >
                  <span>Download app-debug.apk Now</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

