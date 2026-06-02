# Plunder & Peril 🏴‍☠️

## Stato Sviluppo
Versione corrente: 0.3.0 — Wave Defense mode

### Completato ✅
- [x] Progetto Vite/React con Canvas rendering
- [x] Sistema coordinate assiali (pixel → hex corretto, tiling perfetto)
- [x] **Mappe organiche con cellular automata** — isole con forme naturali
- [x] **8 tipi terreno** — deep_ocean, ocean, shallow, reef, sand, land, jungle, port
- [x] 3 tipi nave: Sloop, Brigantino, Galeone
- [x] Movimento BFS con costi terreno, combattimento, AI greedy
- [x] Animazione movimento navi con easing, particelle, acqua animata
- [x] Sistema upgrade (ogni 3 turni/onde: +1 HP / +1 Move / +1 ATK)
- [x] **Skirmish mode** (originale) — battaglia 3v3 con caccia al tesoro
- [x] **Wave Defense mode** (NUOVO!) — sopravvivenza a ondate nemiche crescenti
  - Ondate infinite con difficoltà progressiva
  - Spawn nemici dal lato destro della mappa
  - High score salvato in localStorage
  - Upgrade ogni 3 ondate (sistema riutilizzato)
  - Composizione ondate: sloop → brigantine → galleon
- [x] High score locale con localStorage

### Prossimi step
- Texture overlay ibrido (JPG su colori solidi 20-30% opacità)
- Schermata selezione modalità (Skirmish / Wave Defense)
- Personalizzazione (bandiera, nome capitano, nome nave)

### Asset
Tutte le sprite in `src/assets/`, generate con NanoBanana 2 su Google AI Studio

### Build
`npm run build` — 34 moduli, ~300ms
Dev server: `npm run dev -- --host 0.0.0.0` (porta 5173)
