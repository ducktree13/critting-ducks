import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <main class="placeholder">
    <svg class="duck" viewBox="0 0 120 120" width="160" height="160" role="img" aria-label="A yellow duck">
      <ellipse cx="58" cy="78" rx="34" ry="24" fill="#f5c542" />
      <path d="M46 74 q14 -6 26 2 q-10 12 -26 6 z" fill="#e0a92e" />
      <circle cx="84" cy="48" r="16" fill="#f5c542" />
      <polygon points="98,45 113,50 98,56" fill="#f5892e" />
      <circle cx="88" cy="44" r="2.6" fill="#1a1a1a" />
    </svg>
    <h1>Critting Ducks</h1>
    <p>Under construction &mdash; the ducks are sharpening their beaks.</p>
    <p class="sub">
      Follow the build at
      <a href="https://github.com/AustinSchuetz/critting-ducks">github.com/AustinSchuetz/critting-ducks</a>
    </p>
  </main>
`;
