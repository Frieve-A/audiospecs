# AudioSpecs

Audio equipment database viewer — query and visualize specs for headphones, DACs, amps, speakers, and IEMs entirely in the browser.

**Live site: https://audiospecs.frieve.com**

## Overview

AudioSpecs is a static web application that downloads a SQLite database on first visit and performs all querying and visualization client-side. No server API is required.

### Views

- **Home** — Showcase page with featured scatter plots and tables
- **Analysis Scatter** — Preset-driven scatter plots with category-specific axes
- **Explore** — Filterable product table
- **Compare** — Multi-product side-by-side comparison
- **About** — Site overview and data quality information

### Database

The SQLite database covers 800+ products across 150+ brands in five categories: headphone, speaker, dac, iem, and headphone_amp.

## Tech Stack

- **TypeScript** + **Vite**
- **sql.js** (SQLite compiled to WebAssembly) via Web Worker
- **Plotly.js** for scatter plot visualization

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Type check
npx tsc --noEmit

# Build for production
npm run build
```

## License

[MIT](LICENSE) — Copyright (c) 2026 Frieve
