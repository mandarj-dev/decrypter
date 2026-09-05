import { readFileSync, writeFileSync } from 'fs';

const p = 'src/style.css';
let s = readFileSync(p, 'utf8');
const old = s.match(/:root\s*\{[\s\S]*?\n\}/);
if (!old) throw new Error('no :root');

const neu = `:root {
  /* Backgrounds */
  --bg: #090a0d;
  --surface: #101217;
  --surface-2: #151820;
  --surface-3: #1a1e27;
  --surface-hover: #1d222c;
  --elevated: #151820;

  /* Borders */
  --border: #242934;
  --border-hover: #343b4a;
  --border-active: #5b5ce8;

  /* Text */
  --text: #f2f4f8;
  --text-secondary: #a5adbd;
  --text-muted: #687184;
  --text-disabled: #414754;

  /* Accent */
  --accent: #6258f5;
  --accent-hover: #7168ff;
  --accent-active: #5148dc;
  --accent-soft: rgba(98, 88, 245, 0.12);
  --accent-focus: rgba(98, 88, 245, 0.28);

  /* Semantic */
  --success: #35d399;
  --success-soft: rgba(53, 211, 153, 0.1);
  --warning: #f5b942;
  --warning-soft: rgba(245, 185, 66, 0.1);
  --danger: #ef6262;
  --danger-soft: rgba(239, 98, 98, 0.1);

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius: 10px;

  /* Motion */
  --ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --transition: 140ms var(--ease);

  /* Compat aliases */
  --muted: var(--text-secondary);
  --dim: var(--text-muted);
  --error: var(--danger);
  --accent-glow: var(--accent-focus);

  --mono: 'JetBrains Mono', ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace;
  --sans: 'Geist', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --space: 8px;
  --header-h: 64px;
  --nav-h: 48px;
}`;

s = s.replace(old[0], neu);
writeFileSync(p, s);
console.log('tokens updated');
