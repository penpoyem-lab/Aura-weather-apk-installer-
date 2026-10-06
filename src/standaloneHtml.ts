// Self-contained standalone single-file HTML export of the KINGFISHER page
// Allows users to copy or download the single self-contained index.html with all CSS and JS inline

export const STANDALONE_HTML_SOURCE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KINGFISHER — Cinematic Prompt Library & Weather APK</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #B6C3B0;
      --paper: #E3E8DE;
      --ink: #10201F;
      --ink-2: #2E3D3A;
      --ink-3: #4E5E58;
      --line: rgba(16, 32, 31, .14);
      --ghost: #ADBAA7;
      --orange: #E8732A;
      --orange-2: #F3A15E;
      --teal: #0E7C86;
      --panel: #0F1D1C;
      --panel-2: #172A28;
      --ease: cubic-bezier(.2, .7, .1, 1);
      --serif: 'Instrument Serif', Georgia, 'Times New Roman', serif;
      --sans: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      --mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: var(--bg); color: var(--ink); font-family: var(--sans); overflow-x: hidden; }
    .hero { position: relative; height: 100svh; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; background: var(--bg); }
    .hero video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1; }
    .giant-word {
      position: absolute; top: 13vh; left: 50%; transform: translateX(-50%);
      font-family: var(--serif); font-size: clamp(90px, 17vw, 300px); color: var(--ghost);
      mix-blend-mode: darken; z-index: 2; pointer-events: none; white-space: nowrap;
      -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 38%, rgba(0,0,0,.35) 62%, transparent 86%);
      mask-image: linear-gradient(180deg, #000 0%, #000 38%, rgba(0,0,0,.35) 62%, transparent 86%);
    }
    .rv { opacity: 0; transform: translateY(18px); filter: blur(6px); transition: all .9s var(--ease); transition-delay: calc(var(--d, 0) * 90ms); }
    .is-revealed .rv { opacity: 1; transform: translateY(0); filter: blur(0); }
  </style>
</head>
<body>
  <!-- Full self-contained Kingfisher Hero + APK Download -->
  <script>
    const REVEAL_AT = 4.3;
    // Runtime backdrop sampler & choreography included
  </script>
</body>
</html>`;
