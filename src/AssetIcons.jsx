// Pictographic SVG asset icons. Strong silhouettes, app-icon style.

export const ASSET_BUILD_TYPES = [
  { id: "rover",   label: "Rover",          cost: 8,  reqs: "Mobile prospector", desc: "Mobile prospecting and ice-transport rover." },
  { id: "pad",     label: "Landing pad",    cost: 6,  reqs: "Cargo capacity",    desc: "Additional landing pad for crew or cargo resupply." },
  { id: "habitat", label: "Habitat",        cost: 14, reqs: "Crew expansion",    desc: "Pressurised habitat module supporting extended crew operations." },
  { id: "solar",   label: "Solar array",    cost: 5,  reqs: "Day-side power",    desc: "Photovoltaic array. Works only when sun-lit." },
  { id: "reactor", label: "Fission reactor",cost: 20, reqs: "Round-clock power", desc: "Fission surface power. Continuous output day and night." },
];

function shade(hex, percent) {
  const num = parseInt(hex.replace("#",""), 16);
  const R = Math.min(255, Math.max(0, (num >> 16) + percent));
  const G = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
  const B = Math.min(255, Math.max(0, (num & 0xff) + percent));
  return "#" + ((R<<16) | (G<<8) | B).toString(16).padStart(6,"0");
}

export function AssetIcon({ type, color = "#A8A8F0", size = 48, dim = false, style }) {
  const fill   = dim ? "#3A3658" : color;
  const stroke = dim ? "#1B1934" : shade(color, -55);
  const accent = dim ? "#5A567A" : shade(color, 50);
  const dark   = "#0F0C1C";
  const common = {
    width: size, height: size,
    viewBox: "0 0 64 64",
    xmlns: "http://www.w3.org/2000/svg",
    style: { display:"block", overflow:"visible", ...style },
  };
  switch (type) {
    case "rover":
      return (
        <svg {...common}>
          <ellipse cx="32" cy="56" rx="22" ry="3" fill="rgba(0,0,0,0.45)"/>
          {[-1, 0, 1].map(i => (
            <g key={i}>
              <rect x="6" y={20 + i*12} width="6" height="8" rx="1.5" fill={dark} stroke={stroke} strokeWidth="1"/>
              <rect x="52" y={20 + i*12} width="6" height="8" rx="1.5" fill={dark} stroke={stroke} strokeWidth="1"/>
            </g>
          ))}
          <rect x="12" y="16" width="40" height="32" rx="3" fill={fill} stroke={stroke} strokeWidth="2"/>
          <rect x="16" y="20" width="32" height="12" rx="1" fill={accent} stroke={stroke} strokeWidth="1.2"/>
          {[24, 32, 40].map(x => (
            <line key={x} x1={x} y1="20" x2={x} y2="32" stroke={stroke} strokeWidth="0.7" opacity="0.7"/>
          ))}
          <line x1="16" y1="26" x2="48" y2="26" stroke={stroke} strokeWidth="0.7" opacity="0.7"/>
          <rect x="30" y="6" width="4" height="14" fill={stroke}/>
          <circle cx="32" cy="6" r="3.5" fill={accent} stroke={stroke} strokeWidth="1"/>
          <rect x="16" y="36" width="32" height="10" rx="1" fill={shade(fill, -15)} stroke={stroke} strokeWidth="1"/>
          <line x1="20" y1="40" x2="44" y2="40" stroke={stroke} strokeWidth="0.7" opacity="0.5"/>
        </svg>
      );
    case "habitat":
      return (
        <svg {...common}>
          <ellipse cx="32" cy="58" rx="24" ry="3" fill="rgba(0,0,0,0.45)"/>
          <rect x="6" y="46" width="52" height="8" rx="1.5" fill={shade(fill, -25)} stroke={stroke} strokeWidth="1.5"/>
          <path d="M 8 46 Q 8 14 32 14 Q 56 14 56 46 Z" fill={fill} stroke={stroke} strokeWidth="2"/>
          <path d="M 14 38 Q 14 20 28 18" fill="none" stroke={accent} strokeWidth="2.5" opacity="0.55"/>
          {[18, 32, 46].map(cx => (
            <g key={cx}>
              <circle cx={cx} cy="38" r="3.5" fill={accent} stroke={stroke} strokeWidth="1.2"/>
              <circle cx={cx} cy="38" r="1.5" fill={shade(accent, -20)}/>
            </g>
          ))}
          <rect x="28" y="40" width="8" height="14" rx="1" fill={dark} stroke={stroke} strokeWidth="1.2"/>
          <circle cx="34" cy="48" r="0.9" fill={accent}/>
          <line x1="32" y1="14" x2="32" y2="6" stroke={stroke} strokeWidth="1.5"/>
          <circle cx="32" cy="6" r="2" fill={accent} stroke={stroke} strokeWidth="0.8"/>
        </svg>
      );
    case "solar":
      return (
        <svg {...common}>
          <ellipse cx="32" cy="58" rx="22" ry="3" fill="rgba(0,0,0,0.45)"/>
          <rect x="20" y="50" width="24" height="6" rx="1" fill={shade(fill, -25)} stroke={stroke} strokeWidth="1.5"/>
          <rect x="30" y="28" width="4" height="24" fill={stroke}/>
          <g transform="translate(32 22) rotate(-12) translate(-32 -22)">
            <rect x="6" y="10" width="52" height="22" rx="2" fill={accent} stroke={stroke} strokeWidth="2"/>
            {[19, 32, 45].map(x => (
              <line key={x} x1={x} y1="10" x2={x} y2="32" stroke={stroke} strokeWidth="1" opacity="0.75"/>
            ))}
            {[17.3, 24.7].map(y => (
              <line key={y} x1="6" y1={y} x2="58" y2={y} stroke={stroke} strokeWidth="1" opacity="0.75"/>
            ))}
            <rect x="8" y="11" width="14" height="3" rx="0.5" fill={shade(accent, 30)} opacity="0.5"/>
          </g>
        </svg>
      );
    case "reactor":
      return (
        <svg {...common}>
          <ellipse cx="32" cy="58" rx="24" ry="3" fill="rgba(0,0,0,0.45)"/>
          <rect x="8" y="48" width="48" height="8" rx="1.5" fill={shade(fill, -25)} stroke={stroke} strokeWidth="1.5"/>
          <path d="M 14 48 Q 14 22 32 22 Q 50 22 50 48 Z" fill={fill} stroke={stroke} strokeWidth="2"/>
          <circle cx="32" cy="38" r="9" fill={accent} stroke={stroke} strokeWidth="1.2"/>
          <circle cx="32" cy="38" r="5" fill={shade(accent, 50)} opacity="0.85"/>
          <g fill={stroke}>
            <circle cx="32" cy="38" r="1.8"/>
            <path d="M 32 32 L 34.5 35.5 L 29.5 35.5 Z"/>
            <path d="M 26 41 L 29.5 39.5 L 29.5 44 Z"/>
            <path d="M 38 41 L 34.5 39.5 L 34.5 44 Z"/>
          </g>
          <rect x="28" y="14" width="8" height="10" rx="0.8" fill={shade(fill, -10)} stroke={stroke} strokeWidth="1.2"/>
          <ellipse cx="32" cy="14" rx="4" ry="1.5" fill={shade(accent, 30)} opacity="0.85"/>
          <rect x="6" y="36" width="8" height="3" fill={stroke}/>
          <rect x="6" y="42" width="8" height="3" fill={stroke}/>
          <rect x="50" y="36" width="8" height="3" fill={stroke}/>
          <rect x="50" y="42" width="8" height="3" fill={stroke}/>
        </svg>
      );
    case "pad":
      return (
        <svg {...common}>
          <ellipse cx="32" cy="58" rx="26" ry="3" fill="rgba(0,0,0,0.45)"/>
          <polygon points="20,8 44,8 56,20 56,44 44,56 20,56 8,44 8,20" fill={fill} stroke={stroke} strokeWidth="2"/>
          <polygon points="24,16 40,16 48,24 48,40 40,48 24,48 16,40 16,24" fill="none" stroke={stroke} strokeWidth="1.2" opacity="0.5"/>
          <text x="32" y="40" textAnchor="middle" fontFamily="'Bricolage Grotesque', sans-serif" fontSize="22" fontWeight="800" fill={stroke}>H</text>
          {[[20,8],[44,8],[56,20],[56,44],[44,56],[20,56],[8,44],[8,20]].map(([x,y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2" fill={accent} stroke={stroke} strokeWidth="0.8"/>
          ))}
        </svg>
      );
    case "waypoint":
      return (
        <svg {...common}>
          <circle cx="32" cy="32" r="14" fill="none" stroke={fill} strokeWidth="3" strokeDasharray="5 4"/>
          <circle cx="32" cy="32" r="5" fill={fill}/>
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="12" y="12" width="40" height="40" rx="4" fill={fill} stroke={stroke} strokeWidth="2"/>
        </svg>
      );
  }
}

export function BuildPalette({
  actorIdx, color, budget = 0,
  onSelectBuild, selectedBuild,
  disabled = false,
  onDragStart, onDragEnd,
}) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:7,
      padding:"7px 12px",
      background:"linear-gradient(180deg, rgba(20,18,32,0.94), rgba(27,25,52,0.85))",
      border:`1px solid ${color}38`,
      borderLeft:`3px solid ${color}`,
      borderRadius:6,
      flexWrap:"wrap",
    }}>
      <div style={{
        fontSize:9, letterSpacing:"0.22em", color: color,
        fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:600,
        marginRight:6, textTransform:"uppercase",
      }}>
        Actor {actorIdx === 0 ? "I" : "II"} build palette
      </div>
      {ASSET_BUILD_TYPES.map((t) => {
        const affordable = budget >= t.cost;
        const enabled = !disabled && affordable;
        const selected = selectedBuild === t.id;
        return (
          <button
            key={t.id}
            disabled={!enabled}
            draggable={enabled}
            onClick={() => onSelectBuild(selected ? null : t.id)}
            onDragStart={(e) => {
              if (!enabled) { e.preventDefault(); return; }
              try { e.dataTransfer.setData("text/plain", t.id); } catch {}
              try { e.dataTransfer.effectAllowed = "copy"; } catch {}
              onDragStart && onDragStart(t.id, e);
            }}
            onDragEnd={() => { onDragEnd && onDragEnd(); }}
            title={`${t.label}: ${t.cost} credits. ${t.desc}`}
            style={{
              display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
              minWidth: 72, padding:"6px 8px 5px",
              background: selected
                ? `linear-gradient(135deg, ${color}28, ${color}10)`
                : affordable ? "rgba(27,25,52,0.7)" : "rgba(27,25,52,0.35)",
              border: `1px solid ${selected ? color : `${color}33`}`,
              borderRadius: 5,
              cursor: enabled ? "grab" : "not-allowed",
              opacity: enabled ? 1 : 0.4,
              transition:"all 0.12s",
              boxShadow: selected ? `0 0 10px ${color}33` : "none",
            }}>
            <AssetIcon type={t.id} color={color} size={36} dim={!affordable}/>
            <div style={{
              fontSize:9.5, color: selected ? "#ECEAF8" : "#C0B8E8",
              fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic", fontWeight:400,
              marginTop:3, letterSpacing:"-0.005em",
            }}>{t.label}</div>
            <div style={{
              fontSize:8.5, color: affordable ? color : "#5A567A",
              fontFamily:"'Bricolage Grotesque',sans-serif", fontWeight:500,
              letterSpacing:"0.05em",
            }}>{t.cost} cr</div>
          </button>
        );
      })}
      <div style={{
        marginLeft:"auto", fontSize:10.5, color:"#8B86B0",
        fontFamily:"'Spectral',Georgia,serif", fontStyle:"italic",
      }}>
        budget: <span style={{ color: color, fontWeight:600, fontStyle:"normal",
          fontFamily:"'Bricolage Grotesque',sans-serif" }}>{Math.round(budget)} cr</span>
      </div>
    </div>
  );
}
