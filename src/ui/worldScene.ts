// World backdrop (Phase F chunk 2, PLAN2.md world redesign): a single static
// SVG painted once into #world-backdrop behind the frameless world areas.
// Sky gradient, two far rolling-hill layers (depth), a ground band that
// rises into a hillside behind the mine (left) and flattens into a clearing
// behind the arena (right), plus day clouds / night stars swapped by the
// [data-mode] attribute on <html> (pure CSS display toggle — no JS needed
// per frame).

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
        <circle cx="40" cy="100" r="1.4" fill="var(--scene-detail)"/>
        <circle cx="120" cy="90" r="1.8" fill="var(--scene-detail)"/>
        <circle cx="150" cy="70" r="1.2" fill="var(--scene-detail)"/>
        <circle cx="95" cy="60" r="1.5" fill="var(--scene-detail)"/>
        <circle cx="180" cy="55" r="1.1" fill="var(--scene-detail)" class="twinkle" style="animation-delay:0.3s"/>
        <circle cx="230" cy="40" r="1.6" fill="var(--scene-detail)"/>
        <circle cx="260" cy="110" r="1.3" fill="var(--scene-detail)"/>
        <circle cx="300" cy="140" r="1.9" fill="var(--scene-detail)" class="twinkle" style="animation-delay:1.9s"/>
        <circle cx="340" cy="70" r="1.4" fill="var(--scene-detail)" class="twinkle" style="animation-delay:1.1s"/>
        <circle cx="380" cy="100" r="1.1" fill="var(--scene-detail)"/>
        <circle cx="420" cy="130" r="1.7" fill="var(--scene-detail)"/>
        <circle cx="460" cy="60" r="1.2" fill="var(--scene-detail)"/>
        <circle cx="510" cy="60" r="1.8" fill="var(--scene-detail)"/>
        <circle cx="550" cy="130" r="1.3" fill="var(--scene-detail)" class="twinkle" style="animation-delay:0.9s"/>
        <circle cx="600" cy="95" r="1.5" fill="var(--scene-detail)" class="twinkle" style="animation-delay:2.0s"/>
        <circle cx="650" cy="140" r="1.1" fill="var(--scene-detail)"/>
        <circle cx="700" cy="50" r="1.9" fill="var(--scene-detail)"/>
        <circle cx="745" cy="105" r="1.3" fill="var(--scene-detail)"/>
        <circle cx="790" cy="120" r="1.6" fill="var(--scene-detail)"/>
        <circle cx="830" cy="45" r="1.2" fill="var(--scene-detail)" class="twinkle" style="animation-delay:2.6s"/>
        <circle cx="880" cy="70" r="1.7" fill="var(--scene-detail)" class="twinkle" style="animation-delay:0.7s"/>
        <circle cx="920" cy="135" r="1.1" fill="var(--scene-detail)"/>
        <circle cx="960" cy="110" r="1.4" fill="var(--scene-detail)"/>
        <circle cx="1000" cy="50" r="1.8" fill="var(--scene-detail)"/>
        <circle cx="1050" cy="60" r="1.5" fill="var(--scene-detail)"/>
        <circle cx="1090" cy="130" r="1.2" fill="var(--scene-detail)" class="twinkle" style="animation-delay:1.4s"/>
        <circle cx="1130" cy="100" r="1.6" fill="var(--scene-detail)" class="twinkle" style="animation-delay:1.6s"/>
        <circle cx="1170" cy="40" r="1.1" fill="var(--scene-detail)"/>
        <circle cx="1220" cy="55" r="1.7" fill="var(--scene-detail)"/>
        <circle cx="1260" cy="135" r="1.3" fill="var(--scene-detail)"/>
        <circle cx="1300" cy="120" r="1.5" fill="var(--scene-detail)"/>
        <circle cx="1340" cy="45" r="1.2" fill="var(--scene-detail)" class="twinkle" style="animation-delay:2.2s"/>
        <circle cx="1380" cy="75" r="1.8" fill="var(--scene-detail)" class="twinkle" style="animation-delay:2.4s"/>
        <circle cx="1450" cy="115" r="1.4" fill="var(--scene-detail)"/>
        <circle cx="1490" cy="45" r="1.1" fill="var(--scene-detail)"/>
        <circle cx="1520" cy="65" r="1.6" fill="var(--scene-detail)"/>
        <circle cx="1560" cy="110" r="1.3" fill="var(--scene-detail)" class="twinkle" style="animation-delay:0.5s"/>

        <path class="scene-star-sparkle" transform="translate(210,85)" d="M 0 -9 L 2.2 -2.2 L 9 0 L 2.2 2.2 L 0 9 L -2.2 2.2 L -9 0 L -2.2 -2.2 Z" fill="var(--scene-detail)" class="twinkle" style="animation-delay:0.2s"/>
        <path class="scene-star-sparkle" transform="translate(480,45)" d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" fill="var(--scene-detail)" class="twinkle" style="animation-delay:1.3s"/>
        <path class="scene-star-sparkle" transform="translate(870,110)" d="M 0 -10 L 2.4 -2.4 L 10 0 L 2.4 2.4 L 0 10 L -2.4 2.4 L -10 0 L -2.4 -2.4 Z" fill="var(--scene-detail)" class="twinkle" style="animation-delay:2.1s"/>
        <path class="scene-star-sparkle" transform="translate(1150,50)" d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z" fill="var(--scene-detail)" class="twinkle" style="animation-delay:0.8s"/>
        <path class="scene-star-sparkle" transform="translate(1310,90)" d="M 0 -9 L 2.2 -2.2 L 9 0 L 2.2 2.2 L 0 9 L -2.2 2.2 L -9 0 L -2.2 -2.2 Z" fill="var(--scene-detail)" class="twinkle" style="animation-delay:1.7s"/>

        <circle class="scene-moon-glow" cx="1436" cy="180" r="70" fill="var(--scene-detail)" opacity="0.18"/>
        <path class="scene-moon" d="M 1420 150 a 46 46 0 1 0 6 90 a 60 60 0 0 1 -6 -90 Z" fill="var(--scene-detail)"/>
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
