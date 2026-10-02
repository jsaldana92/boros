export function Ouroboros() {
  return <svg className="ouroboros" viewBox="0 0 64 64" role="img" aria-label="Ouroboros: a snake eating its tail">
    <path d="M45 12C22-2 2 20 11 41c8 20 35 20 44 0 5-11 1-24-8-29" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
    <path d="M44 7 33 12 43 22 53 17Z" fill="currentColor" /><circle cx="44" cy="13" r="1.8" className="snake-eye" />
    <path d="m16 23 4 2m-5 9 4-1m2 11 3-3m7 7v-4m11 1-2-4m9-5-4-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
}
