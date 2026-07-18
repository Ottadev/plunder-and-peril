# Plunder & Peril 🏴‍☠️

## Stato Sviluppo
Versione corrente: **0.5.0 — Fog of War & Naval Abilities**

### Completato ✅
- [x] Progetto Vite/React con Canvas rendering
- [x] Sistema coordinate assiali, mappe organiche, 8 tipi terreno
- [x] 3 tipi nave, movimento BFS, combattimento, AI greedy
- [x] Animazione movimento navi con easing, particelle, acqua animata
- [x] Sistema upgrade (ogni 3 turni/onde: +1 HP / +1 Move / +1 ATK)
- [x] **Skirmish mode** — battaglia 3v3 con caccia al tesoro
- [x] **Wave Defense mode** — sopravvivenza a ondate nemiche
- [x] High score locale con localStorage
- [x] **Personalizzazione** ⚓
  - Nome capitano, nome ammiraglia, nomi unici nave, 6 colori bandiera
- [x] **🌫️ Nebbia di Guerra** (v0.5.0)
  - BFS visibility range 2 da ogni nave alleata
  - Esplorazione persistente (hex già visti restano semi-visibili)
  - Overlay Canvas: hex mai visti al 85% buio, già visti al 55%
- [x] **💥 Floating Damage Numbers** (v0.5.0)
  - Numeri rossi animati al colpo (-N con fade out + float up 20px in 600ms)
  - Rossi per danni nemici, arancioni per danni del giocatore
- [x] **🗺️ Modificatori Difensivi** (v0.5.0)
  - Giungla +2 difesa, Terra/Scogliera +1, costa/oceano 0
  - Danno effettivo = max(1, attacco × moltiplicatore - difesa)
  - Integrato sia player che AI
- [x] **⚔️ Abilità Speciali per Tipo Nave** (v0.5.0)
  - Sloop → **Ricognizione**: rivela 3 tile nella nebbia (raggio 3, CD 3 turni)
  - Brigantine → **Fuoco Concentrato**: +50% danno nel prossimo attacco (CD 3 turni)
  - Galleon → **Scudo**: alleati adiacenti protetti (-2 danni per 1 turno, CD 3)
  - Pulsante abilità nel pannello info unità selezionata
- [x] **🎵 Effetti Sonori** (v0.5.0)
  - Web Audio API synth (zero file audio)
  - Spara cannone: boom grave + ping metallico
  - Esplosione nave: noise burst + rombo
  - Abilità: tono magico ascendente
- [x] **🎭 AI Personality Slider** (v0.5.0)
  - Slider 0-100% nel pannello impostazioni (salvato in localStorage)
  - 0-30%: AI passiva (fugge, attacca solo con vantaggio)
  - 40-60%: bilanciata (comportamento standard)
  - 70-100%: aggressiva (attacca sempre se in range)

### Prossimi step
- Event System + Weather (tempesta, bonaccia, mostro marino)
- Post-Game Stats Screen dettagliato
- Schermata selezione modalità (Skirmish / Wave Defense)
- Fleet Composer (preset formazioni)

### Asset
Tutte le sprite in `src/assets/`, generate con NanoBanana 2 su Google AI Studio

### Build
`npm run build` — 35 moduli, ~280ms
Dev server: `npm run dev -- --host 0.0.0.0` (porta 5173)
