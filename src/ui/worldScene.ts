// World backdrop (Phase F chunk 2, PLAN2.md world redesign): a single static
// SVG painted once into #world-backdrop behind the frameless world areas.
// Sky gradient, two far rolling-hill layers (depth), a ground band that
// rises into a hillside behind the mine (left) and flattens into a clearing
// behind the arena (right), plus day clouds / night stars swapped by the
// [data-mode] attribute on <html> (pure CSS display toggle — no JS needed
// per frame).

// Night stars, generated deterministically (fixed LCG seed) so the field is
// identical every load. Design notes (playtest: "the stars look bad"):
// - Spread through the upper sky down to y=470 (above the far hills) — the
//   old hand-authored band at y=40..140 was cropped ENTIRELY at wide window
//   aspects because the backdrop is bottom-anchored (xMidYMax slice).
// - Varied radius (1.2..3.2) and per-star opacity (0.45..1) so the field has
//   depth instead of uniform dust; a third of them twinkle on varied delays.
// - A few "bright" stars get a soft halo circle instead of a filter blur.
function starsMarkup(): string {
  let seed = 0x9e3779b9 >>> 0;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
  const parts: string[] = [];
  for (let i = 0; i < 30; i++) {
    const x = Math.round(30 + rnd() * 1540);
    const y = Math.round(30 + rnd() * 440);
    const r = (1.2 + rnd() * 2).toFixed(1);
    const o = (0.45 + rnd() * 0.55).toFixed(2);
    const twinkle = rnd() < 0.35;
    const anim = twinkle
      ? ` class="twinkle" style="animation-delay:${(rnd() * 3).toFixed(1)}s; animation-duration:${(2.6 + rnd() * 2).toFixed(1)}s"`
      : "";
    parts.push(`<circle cx="${x}" cy="${y}" r="${r}" fill="var(--scene-detail)" opacity="${o}"${anim}/>`);
  }
  // Bright stars: a soft halo behind a slightly larger core, no filters.
  for (let i = 0; i < 5; i++) {
    const x = Math.round(80 + rnd() * 1440);
    const y = Math.round(50 + rnd() * 360);
    parts.push(
      `<circle cx="${x}" cy="${y}" r="7" fill="var(--scene-detail)" opacity="0.14"/>`,
      `<circle cx="${x}" cy="${y}" r="2.6" fill="var(--scene-detail)" opacity="0.95" class="twinkle" style="animation-delay:${(rnd() * 3).toFixed(1)}s; animation-duration:${(3 + rnd() * 2).toFixed(1)}s"/>`,
    );
  }
  return parts.join("\n        ");
}

export function initWorldScene(el: HTMLElement): void {
  el.innerHTML = `
    <svg
      class="world-scene-svg"
      viewBox="0 0 1600 900"
      preserveAspectRatio="xMidYMax slice"
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="scene-sky-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--sky-top)"/>
          <stop offset="100%" stop-color="var(--sky-bottom)"/>
        </linearGradient>
      </defs>

      <rect class="scene-sky" x="0" y="0" width="1600" height="900" fill="url(#scene-sky-grad)"/>

      <g class="scene-stars">
        ${starsMarkup()}

        <!-- Moon: layered soft halo (no CSS blur) + crescent. -->
        <circle cx="1436" cy="180" r="78" fill="var(--scene-detail)" opacity="0.07"/>
        <circle cx="1436" cy="180" r="58" fill="var(--scene-detail)" opacity="0.10"/>
        <path class="scene-moon" d="M 1420 150 a 46 46 0 1 0 6 90 a 60 60 0 0 1 -6 -90 Z" fill="var(--scene-detail)" opacity="0.95"/>
      </g>

      <g class="scene-clouds">
        <g class="cloud" style="animation-delay:0s; animation-duration:74s">
          <ellipse cx="220" cy="140" rx="70" ry="26" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="270" cy="128" rx="48" ry="20" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="175" cy="130" rx="42" ry="18" fill="var(--scene-detail)" opacity="0.8"/>
        </g>
        <g class="cloud" style="animation-delay:-18s; animation-duration:88s">
          <ellipse cx="700" cy="90" rx="60" ry="22" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="745" cy="82" rx="40" ry="16" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="660" cy="82" rx="36" ry="15" fill="var(--scene-detail)" opacity="0.8"/>
        </g>
        <g class="cloud" style="animation-delay:-40s; animation-duration:66s">
          <ellipse cx="1150" cy="160" rx="78" ry="28" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="1205" cy="148" rx="50" ry="20" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="1100" cy="150" rx="44" ry="18" fill="var(--scene-detail)" opacity="0.8"/>
        </g>
        <g class="cloud" style="animation-delay:-60s; animation-duration:80s">
          <ellipse cx="1420" cy="100" rx="54" ry="20" fill="var(--scene-detail)" opacity="0.8"/>
          <ellipse cx="1460" cy="92" rx="34" ry="14" fill="var(--scene-detail)" opacity="0.8"/>
        </g>
      </g>

      <path class="scene-hill-far"
        d="M 0 620 C 200 560, 420 560, 620 610 C 860 668, 1080 560, 1320 600 C 1440 620, 1540 600, 1600 590 L 1600 900 L 0 900 Z"
        fill="color-mix(in srgb, var(--ground) 55%, var(--sky-bottom))"/>

      <path class="scene-hill-mid"
        d="M 0 700 C 180 640, 380 660, 560 700 C 820 758, 1060 660, 1300 690 C 1420 704, 1520 690, 1600 680 L 1600 900 L 0 900 Z"
        fill="color-mix(in srgb, var(--ground) 70%, var(--sky-bottom))"/>

      <path class="scene-ground"
        d="M 0 900 L 0 560 C 90 500, 180 470, 280 470 C 400 470, 460 560, 560 640 C 700 750, 900 780, 1120 770 C 1300 762, 1460 780, 1600 760 L 1600 900 Z"
        fill="var(--ground)"/>
    </svg>
  `;
}
