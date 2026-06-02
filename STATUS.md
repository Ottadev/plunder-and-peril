# Plunder & Peril 🏴‍☠️

## Stato Sviluppo
Versione corrente: 0.4.0 — Personalizzazione

### Completato ✅
- [x] Progetto Vite/React con Canvas rendering
- [x] Sistema coordinate assiali, mappe organiche, 8 tipi terreno
- [x] 3 tipi nave, movimento BFS, combattimento, AI greedy
- [x] Animazione movimento navi con easing, particelle, acqua animata
- [x] Sistema upgrade (ogni 3 turni/onde: +1 HP / +1 Move / +1 ATK)
- [x] **Skirmish mode** — battaglia 3v3 con caccia al tesoro
- [x] **Wave Defense mode** — sopravvivenza a ondate nemiche
- [x] High score locale con localStorage
- [x] **Personalizzazione** ⚓ (NUOVO!)
  - Nome capitano modificabile (salvato in localStorage)
  - Nome nave ammiraglia personalizzabile
  - Nomi unici per ogni nave (pool di 8 nomi pirata)
  - Bandiera colorata: 6 colori tra cui scegliere
  - Overlay "Captain's Quarters" per modificare tutto
  - Pennant disegnato programmaticamente con il colore scelto

### Prossimi step
- Texture overlay ibrido (JPG su colori solidi 20-30% opacità)
- Schermata selezione modalità (Skirmish / Wave Defense)

### Asset
Tutte le sprite in `src/assets/`, generate con NanoBanana 2 su Google AI Studio

### Build
`npm run build` — 34 moduli, ~300ms
Dev server: `npm run dev -- --host 0.0.0.0` (porta 5173)
