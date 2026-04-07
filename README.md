# Influenza Clade Explorer

A dynamic, interactive web application for exploring and visualizing seasonal Influenza A and B clade nomenclature in real-time.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Status](https://img.shields.io/badge/status-alpha-purple.svg)

## Overview

The Influenza Clade Explorer provides an intuitive interface to navigate the complex hierarchical relationships of influenza virus clades. This tool visualizes hemagglutinin (HA) subclade nomenclature for H3N2, H1N1pdm, and B/Victoria lineages, pulling data directly from authoritative sources in real-time.

## Data Source and Update Times

Since data is fetched dynamically from GitHub:

Automatic Updates: New clades appear as soon as they're added to the official repositories
Manual Refresh: Click "🔄 Refresh Data" to reload without page refresh
Version Tracking: Check the footer for the current version

All clade nomenclature data is sourced from the official [Influenza Clade Nomenclature](https://github.com/influenza-clade-nomenclature) GitHub repositories:

- **H3N2:** [`seasonal-flu/h3n2/ha`](https://github.com/influenza-clade-nomenclature/seasonal-flu/tree/main/h3n2/ha)
- **H1N1pdm:** [`seasonal-flu/h1n1pdm/ha`](https://github.com/influenza-clade-nomenclature/seasonal-flu/tree/main/h1n1pdm/ha)
- **B/Victoria:** [`seasonal-flu/vic/ha`](https://github.com/influenza-clade-nomenclature/seasonal-flu/tree/main/vic/ha)

### Data Structure

Each lineage contains:
- `clade_definitions.tsv` - Defines clades, parent relationships, and defining mutations
- `aliases.tsv` - Maps shortened clade aliases to full nomenclature
- `representative_isolates.tsv` - Lists representative sequences for each clade

## Dynamic Data Loading

### Real-Time Updates

The application **always pulls fresh data** from the GitHub repositories on each page load:

1. **On Initialization:** Data is fetched directly from GitHub's raw content API
2. **Refresh Button:** Users can manually reload data without refreshing the page
3. **No Caching:** Ensures users always see the most current nomenclature

### Data Processing Pipeline

fetchData(lineage) → parseData() → buildHierarchy() → renderTree()

1. **Fetch (`fetchData`):**
   - Fetches three TSV files from GitHub raw URLs
   - Uses JavaScript's `fetch()` API with error handling
   - Supports CORS-enabled public GitHub content

2. **Parse (`parseData`):**
   - Parses TSV format using D3's `d3.tsvParse()`
   - Extracts clade names, parent relationships, mutations, and aliases
   - Merges data from multiple files into unified clade objects

3. **Build Hierarchy (`buildHierarchy`):**
   - Constructs tree structure from parent-child relationships
   - Identifies root nodes (clades without parents)
   - Handles orphaned nodes and circular references
   - Computes depth levels for layout

4. **Render (`renderTree`):**
   - Generates hierarchical tree layout using D3.js
   - Applies custom positioning algorithms
   - Renders nodes, edges, and mutation labels
   - Enables interactive features (zoom, pan, selection)

## Visualization Features

### Interactive Tree Layout

- **Hierarchical Visualization:** Parent-child relationships shown as connected nodes
- **Color Coding:** Major clade groups distinguished by color
- **Mutation Labels:** Defining mutations displayed on edges between clades
- **Dynamic Positioning:** Adjustable spacing and layout parameters

### User Interactions

- **Click Selection:** Click nodes to view detailed information
- **Multi-Select:** Ctrl/Cmd + Click to compare multiple clades
- **Search:** Real-time search to highlight specific clades
- **Filter:** Show only descendants of selected clades
- **Zoom & Pan:** Navigate large trees with mouse/trackpad

### Customization Controls

- **Label Size:** Adjust text size (8-30px)
- **Edge Length:** Control horizontal spacing (40-150px)
- **Vertical Spacing:** Adjust node separation (12-150px)
- **Node Size:** Modify circle radius (3-20px)
- **Mutation Font:** Change mutation label size (5-30px)

### Inspector Panel

Displays detailed information for selected clades:
- Clade name and alias
- Parent clade
- Defining mutations (color-coded)
- Representative isolates
- Multi-clade comparison mode

### Data Table

Sortable, filterable table view with:
- All clades and metadata
- Sortable columns (clade, parent, mutations, etc.)
- Real-time filtering
- CSV export functionality

## 🛠️ Technical Stack

- **Framework:** [Quarto](https://quarto.org/) (HTML output)
- **Visualization:** [D3.js v7](https://d3js.org/)
- **Styling:** Custom CSS with CSS Grid and Flexbox
- **Data Format:** TSV (Tab-Separated Values)
- **Deployment:** Static site (GitHub Pages compatible)

# Citation

If you use this tool in your research, please cite:

```bibtex
@software{akin2025flu,
  author = {Akin, Elgin},
  title = {Influenza Clade Explorer},
  year = {2025},
  url = {https://github.com/yourusername/flu-clade-explorer}
}
```