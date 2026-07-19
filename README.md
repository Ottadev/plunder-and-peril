# Plunder & Peril 🏴‍☠️

> Gioco di strategia esagonale a turni a tema piratesco — React 19 + Canvas 2D

Due flotte si affrontano su un arcipelago generato proceduralmente. Nebbia di guerra, abilità speciali per classe nave, danni volanti, audio sintetizzato e AI adattiva.

## 🎮 Prova subito

```bash
cd ~/Documents/plunder-and-peril
npm run dev -- --host 0.0.0.0
# Apri http://deck:5173
```

## ✨ Feature (v0.5.0)

| Categoria | Feature |
|---|---|
| **🌫️ Nebbia** | Visibility BFS range 2, esplorazione persistente, overlay 2 livelli |
| **⚔️ Abilità** | Sloop→Ricognizione, Brigantine→Fuoco Concentrato, Galleon→Scudo |
| **💥 Danni** | Floating numbers animati (-N con fade 600ms) |
| **🗺️ Terreno** | Difesa variabile: giungla +2, terra +1, costa 0 |
| **🎭 AI** | Slider aggressione 0-100% (passiva→aggressiva) |
| **🎵 Audio** | 5 suoni synth Web Audio API (0 file audio) |
| **⚓ Modalità** | Skirmish 3v3 + caccia tesoro \| Wave Defense ∞ ondate |
| **🎨 Polish** | Particelle, animazioni easing, chroma-key sprite, personalizzazione |

## 🔧 Stack

- React 19 + Vite 8
- Canvas 2D (doppio layer)
- Web Audio API synth
- 16 asset pixel art (NanoBanana 2)
- Build: 35 moduli, ~280ms

## 📁 Architettura

```
src/
├── hooks/
│   ├── useHexGrid.js      # Coordinate, cellular automata, pathfinding
│   └── useGameState.js    # Regole, AI, abilità, nebbia
├── effects/
│   ├── ParticleEngine.js  # Pool 300 particelle, 6 effetti
│   └── AudioEngine.js     # 5 suoni synth
└── components/
    └── GameBoard.jsx       # Canvas rendering, HUD, input
```

## 🚀 Next (v0.6.0)

- Event System + Weather
- Post-Game Stats
- Mode Selection Screen
- Fleet Composer
