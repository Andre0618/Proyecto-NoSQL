// Ilustración del login: alguien en su escritorio entrando al sistema. Es propia (SVG a mano), con la paleta
// de globals.css; los tonos intermedios, más claros u oscuros, son solo de este dibujo.
const C = {
  floor: "#1a262a",
  screen: "#2e4046",
  plate: "#dfe8e6",
  soft: "#93a7ad",
  dark: "#0d1a1f",
  canvas: "#121b1e",
  brand: "#5fb4cc",
  brandLight: "#a9dbe7",
  brandMid: "#7fc4d6",
  hair: "#2c6e82",
  hairShine: "#3f8ea4",
  hot: "#f0983f",
  hotDark: "#d9802c",
  pot: "#b8642a",
  pants: "#2a5a68",
  pantsDark: "#234c58",
  shoe: "#3a5560",
  skin: "#e9b38f",
  skinShade: "#d4987a",
  good: "#6fcf9b",
  goodDark: "#3f9e70",
  warn: "#e2b458",
  bad: "#ff8a80",
}

export function LoginIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 560 420" className={className} aria-hidden="true" focusable="false">
      {/* piso */}
      <ellipse cx="300" cy="392" rx="258" ry="11" fill={C.floor} />

      {/* silla */}
      <g stroke={C.brand} strokeWidth="6" strokeLinecap="round">
        <line x1="80" y1="306" x2="64" y2="388" />
        <line x1="164" y1="306" x2="182" y2="388" />
      </g>
      <rect x="56" y="196" width="26" height="114" rx="11" fill={C.brandLight} />
      <rect x="56" y="290" width="130" height="17" rx="8.5" fill={C.brandLight} />
      <rect x="56" y="300" width="130" height="7" rx="3.5" fill={C.brandMid} />

      {/* torso, cuello y cabeza */}
      <path d="M94 274 C 88 232, 98 192, 126 178 L 150 180 C 168 198, 168 240, 162 274 Z" fill={C.hot} />
      <rect x="131" y="156" width="14" height="26" rx="6" fill={C.skinShade} />
      <ellipse cx="145" cy="140" rx="20" ry="23" fill={C.skin} />
      {/* pelo: cubre la coronilla y cae largo por la espalda */}
      <path
        d="M163 128 C 161 112, 150 105, 137 107 C 119 109, 111 125, 113 147 C 114 173, 106 205, 89 240 C 106 247, 124 234, 130 209 C 134 189, 130 169, 136 153 C 142 141, 152 133, 163 128 Z"
        fill={C.hair}
      />
      <path d="M124 118 C 131 110, 144 107, 154 112" stroke={C.hairShine} strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* piernas */}
      <rect x="96" y="262" width="122" height="30" rx="15" fill={C.pants} />
      <path d="M194 278 L 224 278 L 229 370 L 206 370 Z" fill={C.pantsDark} />
      <circle cx="209" cy="277" r="15" fill={C.pants} />
      <path d="M204 368 q0 -4 5 -4 h17 q4 0 6 4 l3 5 q13 2 16 10 v4 h-47 z" fill={C.shoe} />
      <rect x="204" y="384" width="47" height="3.5" rx="1.75" fill={C.soft} />

      {/* escritorio */}
      <g stroke={C.brand} strokeWidth="7" strokeLinecap="round">
        <line x1="272" y1="240" x2="258" y2="386" />
        <line x1="432" y1="240" x2="452" y2="386" />
      </g>
      <rect x="168" y="227" width="304" height="13" rx="5" fill={C.brandLight} />

      {/* monitor, con un login en la pantalla */}
      <rect x="272" y="208" width="16" height="16" fill={C.brandMid} />
      <rect x="250" y="221" width="60" height="7" rx="3.5" fill={C.brandLight} />
      <rect x="204" y="108" width="152" height="104" rx="9" fill={C.plate} />
      <rect x="212" y="116" width="136" height="80" rx="5" fill={C.screen} />
      <circle cx="280" cy="204" r="2.5" fill={C.soft} />
      <rect x="256" y="122" width="48" height="68" rx="5" fill={C.plate} />
      <circle cx="280" cy="139" r="8" fill={C.brand} />
      <circle cx="280" cy="136.5" r="2.7" fill={C.dark} />
      <path d="M274.5 144.6 a5.5 4.8 0 0 1 11 0 z" fill={C.dark} />
      <rect x="265" y="153" width="30" height="3.5" rx="1.75" fill={C.soft} />
      <rect x="265" y="161" width="30" height="3.5" rx="1.75" fill={C.soft} />
      <rect x="270" y="172" width="20" height="7" rx="3.5" fill={C.hot} />

      {/* teclado y brazo */}
      <rect x="210" y="221" width="50" height="6" rx="3" fill={C.plate} />
      <path d="M142 192 L 174 226" stroke={C.hot} strokeWidth="18" strokeLinecap="round" />
      <path d="M174 226 L 226 224" stroke={C.hotDark} strokeWidth="15" strokeLinecap="round" />
      <circle cx="232" cy="223" r="7.5" fill={C.skin} />

      {/* taza */}
      <rect x="352" y="208" width="17" height="19" rx="3" fill={C.hot} />
      <path d="M369 212 q8 0 8 6 q0 6 -8 6" stroke={C.hot} strokeWidth="3" fill="none" />

      {/* carpetas */}
      <rect x="394" y="156" width="15" height="71" rx="2" fill={C.warn} />
      <rect x="410" y="156" width="15" height="71" rx="2" fill={C.brand} />
      <rect x="426" y="160" width="15" height="67" rx="2" fill={C.good} />
      <rect x="442" y="156" width="17" height="71" rx="2" fill={C.goodDark} />
      <g fill={C.plate} opacity="0.85">
        <rect x="398" y="166" width="7" height="22" rx="1.5" />
        <rect x="414" y="166" width="7" height="22" rx="1.5" />
        <rect x="430" y="170" width="7" height="20" rx="1.5" />
        <rect x="446.5" y="166" width="8" height="22" rx="1.5" />
      </g>
      <g fill={C.dark} opacity="0.55">
        <circle cx="401.5" cy="210" r="2.5" />
        <circle cx="417.5" cy="210" r="2.5" />
        <circle cx="433.5" cy="210" r="2.5" />
        <circle cx="450.5" cy="210" r="2.5" />
      </g>

      {/* maletín */}
      <path d="M314 351 v-8 q0 -6 6 -6 h16 q6 0 6 6 v8" stroke={C.brand} strokeWidth="4" fill="none" />
      <rect x="300" y="350" width="56" height="37" rx="4" fill={C.brandMid} />
      <rect x="340" y="350" width="16" height="37" rx="3" fill={C.dark} opacity="0.6" />
      <rect x="300" y="362" width="56" height="3" fill={C.dark} opacity="0.35" />

      {/* planta */}
      <path d="M500 354 C 468 342, 452 312, 460 288 C 486 296, 502 324, 500 354 Z" fill={C.hot} />
      <path d="M506 354 C 490 320, 492 276, 510 246 C 526 280, 524 322, 506 354 Z" fill={C.brand} />
      <path d="M510 354 C 530 332, 550 318, 552 296 C 530 298, 512 322, 510 354 Z" fill={C.good} />
      <g stroke={C.canvas} strokeWidth="1.6" fill="none" opacity="0.35" strokeLinecap="round">
        <path d="M498 350 C 486 330, 474 312, 464 294" />
        <path d="M507 350 C 505 312, 506 280, 510 254" />
        <path d="M512 350 C 524 334, 538 318, 548 300" />
      </g>
      <path d="M480 352 h52 l-6 36 h-40 z" fill={C.pot} />

      {/* íconos flotando: candado, correo, listo y usuario */}
      <circle cx="226" cy="88" r="14" fill={C.warn} />
      <rect x="220" y="87" width="12" height="9" rx="2" fill={C.dark} />
      <path d="M222.5 87 v-3 a3.5 3.5 0 0 1 7 0 v3" stroke={C.dark} strokeWidth="2" fill="none" />

      <circle cx="266" cy="56" r="17" fill={C.bad} />
      <rect x="256" y="49" width="20" height="14" rx="2" fill={C.plate} />
      <path d="M256.5 50 l9.5 7 l9.5 -7" stroke={C.bad} strokeWidth="2" fill="none" strokeLinejoin="round" />

      <circle cx="304" cy="34" r="12" fill={C.good} />
      <path d="M298.5 34 l4 4 l7.5 -8" stroke={C.dark} strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      <circle cx="334" cy="76" r="14" fill={C.brand} />
      <circle cx="334" cy="71.5" r="4.2" fill={C.dark} />
      <path d="M325.5 84.5 a8.5 7.5 0 0 1 17 0 z" fill={C.dark} />

      <g fill={C.soft} opacity="0.7">
        <circle cx="248" cy="96" r="2" />
        <circle cx="286" cy="80" r="1.6" />
        <circle cx="318" cy="54" r="2" />
        <circle cx="290" cy="98" r="2.4" fill={C.brand} />
        <circle cx="244" cy="70" r="1.6" fill={C.hot} />
      </g>
    </svg>
  )
}
