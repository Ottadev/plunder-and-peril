# Plunder & Peril 🏴‍☠️

## Stato Sviluppo
Versione corrente: 0.2.0 — Asset Integration + Grid Fixes

### Completato ✅
- [x] Progetto Vite/React con Canvas rendering
- [x] Sistema coordinate assiali (pixel → hex corretto, tiling perfetto)
- [x] **Mappe organiche con cellular automata** — isole con forme naturali, non più rumore random
- [x] **8 tipi terreno** — deep_ocean, ocean, shallow, reef, sand, land, jungle, port
- [x] **Oceano profondo** — zone scure lontane dalla costa
- [x] **Scogliere/barriere** — reef come ostacoli non navigabili
- [x] **Porti neutrali** — 2-3 punti di interesse con ancora dorata
- [x] **Spiagge (sand)** — costa sabbiosa dove le navi possono attraccare
- [x] Generazione deterministica (seme 42) con mappe riproducibili
- [x] 3 tipi nave: Sloop, Brigantino, Galeone
- [x] Movimento BFS con costi terreno (solo oceano e costa)
- [x] Combattimento base + turno AI
- [x] Sprite immagini per le navi (generate con AI)
- [x] Chroma-key rimozione sfondo blu dalle sprite navi
- [x] Esplosione effetto combattimento
- [x] Icone UI (cuore HP, stivale movimento, cannoni attacco)
- [x] Colori terreno intuitivi (blu oceano, verde giungla, marrone terra)
- [x] **Sprite baule tesoro** con bagliore pulsante
- [x] **Animazione movimento navi** — interpolazione con easing, BFS path, blocco input
- [x] **Effetti particellari** — sistema pooled (300 particelle), wake navi, esplosioni, increspature acqua
- [x] **Tooltip hover unità** — nome, HP, movimento, attacco vicino cursore
- [x] **Acqua animata** — wave shimmer su tile oceanici con sinusoide drifting
- [x] **Sistema obiettivi (Caccia al tesoro)** — 1-3 tesori su costa, raccolta, vittoria tesori

Nessun task in corso al momento. Prossimi step: Fase 5 (game design avanzato), Brainstorming nuove idee.

### Asset
Tutte le sprite in `src/assets/`, generate con NanoBanana 2 su Google AI Studio

### Build
`npm run build` — 30 moduli, ~260ms
Dev server: `npm run dev -- --host 0.0.0.0` (porta 5173)
