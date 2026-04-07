/**
 * Influenza Clade Explorer - D3.js Visualization
 * Fetches subclade YAML files from GitHub repositories
 */

// ===========================================
// Configuration
// ===========================================
const GITHUB_ORG = 'influenza-clade-nomenclature';
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';

// Repository names for each lineage
const LINEAGE_REPOS = {
  H3N2: 'seasonal_A-H3N2_HA',
  H1N1: 'seasonal_A-H1N1pdm_HA',
  Victoria: 'seasonal_B-Vic_HA'
};

const LINEAGE_DISPLAY = {
  H3N2: 'H3N2',
  H1N1: 'H1N1pdm',
  Victoria: 'B/Victoria'
};

// Base colors for depth levels (will generate shades from these)
const DEPTH_BASE_COLORS = [
  { h: 210, s: 70, l: 50 },  // Blue
  { h: 30, s: 80, l: 50 },   // Orange
  { h: 120, s: 60, l: 40 },  // Green
  { h: 0, s: 70, l: 50 },    // Red
  { h: 270, s: 60, l: 50 },  // Purple
  { h: 180, s: 60, l: 40 },  // Teal
  { h: 330, s: 70, l: 50 },  // Pink
  { h: 60, s: 70, l: 45 },   // Yellow
  { h: 240, s: 50, l: 55 },  // Indigo
  { h: 150, s: 50, l: 45 },  // Sea Green
];

// ===========================================
// State Management
// ===========================================
const state = {
  currentLineage: 'H3N2',
  data: null,
  filteredData: null,
  searchMatches: new Set(),
  selectedNodes: new Set(),
  showLabels: true,
  showLegend: false,
  showTable: false,
  transform: d3.zoomIdentity,
  tableSort: { column: 'clade', direction: 'asc' },
  tableFilter: '',
  dataCache: new Map(),
  lastFetch: new Map(),
  settings: {
    labelSize: 11,
    edgeLength: 80,
    nodeSize: 5,
    mutationFontSize: 7,
    verticalSpacing: 20  // ADD THIS
  }
};

const uiState = {
  showMutations: false,
  fullscreen: false
};

const CACHE_DURATION = 5 * 60 * 1000;

// ===========================================
// DOM Elements
// ===========================================
let elements = {};

// ===========================================
// Initialization
// ===========================================
function init() {
  console.log('Initializing Clade Explorer...');

  elements = {
    svg: d3.select('#tree-svg'),
    tooltip: d3.select('#tooltip'),
    inspectorPanel: d3.select('#inspector-panel'),
    inspectorContent: d3.select('#inspector-content'),
    loading: d3.select('#loading'),
    searchResults: d3.select('#search-results'),
    colorLegend: d3.select('#color-legend'),
    mainTitle: d3.select('#main-title'),
    nodeCount: d3.select('#node-count'),
    cladeFilter: d3.select('#clade-filter'),
    vizContainer: d3.select('#viz-container'),
    tablePanel: d3.select('#table-panel'),
    tableBody: d3.select('#table-body'),
    tableSearch: d3.select('#table-search')
  };

  setupSVG();
  setupEventListeners();
  setupUIControls();
  setupResizablePanels();
  loadData(state.currentLineage);
}

function setupSVG() {
  const container = document.getElementById('viz-container');
  if (!container) {
    console.error('viz-container not found');
    return;
  }

  const rect = container.getBoundingClientRect();
  const width = rect.width || 700;
  const height = rect.height || 600;

  elements.svg
    .attr('width', width)
    .attr('height', height);

  elements.g = elements.svg.append('g')
    .attr('class', 'tree-group');

  const zoom = d3.zoom()
    .scaleExtent([0.1, 4])
    .on('zoom', (event) => {
      state.transform = event.transform;
      elements.g.attr('transform', event.transform);
    });

  elements.svg.call(zoom);
  elements.zoom = zoom;

  window.addEventListener('resize', debounce(() => {
    if (!uiState.fullscreen) {
      const newRect = container.getBoundingClientRect();
      elements.svg.attr('width', newRect.width).attr('height', newRect.height);
      if (state.data) render();
    }
  }, 250));
}

function setupUIControls() {
  // Create control panel
  const controlsHtml = `
    <div class="viz-controls">
      <div class="viz-instructions">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
          <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
        </svg>
        <span>Scroll to zoom • Drag to pan • Click nodes • Ctrl+Click to multi-select</span>
      </div>
      <div class="viz-buttons">
        <button id="zoom-in" class="viz-btn" title="Zoom in">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/>
          </svg>
        </button>
        <button id="zoom-out" class="viz-btn" title="Zoom out">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M4 8a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7A.5.5 0 0 1 4 8z"/>
          </svg>
        </button>
        <button id="reset-view" class="viz-btn" title="Reset view">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
        </button>
        <button id="toggle-fullscreen" class="viz-btn" title="Toggle fullscreen">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
          </svg>
        </button>
        <button id="toggle-mutations" class="viz-btn" title="Toggle mutation labels">
          <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M12.5 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm.5-5v1h1a.5.5 0 0 1 0 1h-1v1a.5.5 0 0 1-1 0v-1h-1a.5.5 0 0 1 0-1h1v-1a.5.5 0 0 1 1 0Z"/>
            <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6.5a.5.5 0 0 1-1 0V2a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3.5a.5.5 0 0 1 0 1H4a2 2 0 0 1-2-2V2Z"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  elements.vizContainer.node().insertAdjacentHTML('afterbegin', controlsHtml);
  
  // Zoom controls
  d3.select('#zoom-in').on('click', () => {
    elements.svg.transition().duration(300).call(
      elements.zoom.scaleBy, 1.3
    );
  });
  
  d3.select('#zoom-out').on('click', () => {
    elements.svg.transition().duration(300).call(
      elements.zoom.scaleBy, 0.7
    );
  });
  
  d3.select('#reset-view').on('click', () => {
    if (state.data) {
      const nodes = state.filteredData || state.data.nodes;
      const hierarchyData = buildHierarchy(nodes);
      const root = d3.hierarchy(hierarchyData);
      const container = document.getElementById('viz-container');
      const rect = container.getBoundingClientRect();
      centerView(root, rect.width, rect.height, hierarchyData.isVirtualRoot);
    }
  });
  
  // Fullscreen toggle
  d3.select('#toggle-fullscreen').on('click', () => {
    uiState.fullscreen = !uiState.fullscreen;
    elements.vizContainer.classed('fullscreen', uiState.fullscreen);
    d3.select('#toggle-fullscreen').classed('active', uiState.fullscreen);
    
    // Update SVG dimensions after fullscreen change
    setTimeout(() => {
      const container = document.getElementById('viz-container');
      const rect = container.getBoundingClientRect();
      elements.svg.attr('width', rect.width).attr('height', rect.height);
      if (state.data) render();
    }, 100);
  });
  
  // Mutation labels toggle
  d3.select('#toggle-mutations').on('click', () => {
    uiState.showMutations = !uiState.showMutations;
    d3.select('#toggle-mutations').classed('active', uiState.showMutations);
    elements.g.selectAll('.mutation-label')
      .transition()
      .duration(200)
      .style('opacity', uiState.showMutations ? 1 : 0)
      .style('display', uiState.showMutations ? 'block' : 'none');
  });
}

function setupEventListeners() {
  d3.select('#lineage-select').on('change', function() {
    state.currentLineage = this.value;
    state.searchMatches.clear();
    state.selectedNodes.clear();
    state.filteredData = null;
    d3.select('#search-input').property('value', '');
    elements.searchResults.text('');
    elements.cladeFilter.property('value', '');
    elements.tableSearch.property('value', '');
    state.tableFilter = '';
    updateInspector();
    loadData(state.currentLineage);
  });

  d3.select('#refresh-data').on('click', function() {
    state.dataCache.delete(state.currentLineage);
    state.lastFetch.delete(state.currentLineage);
    loadData(state.currentLineage);
  });

  elements.cladeFilter.on('change', function() {
    filterToClade(this.value);
  });

  d3.select('#search-input').on('input', debounce(function() {
    handleSearch(this.value.toLowerCase().trim());
  }, 200));

  d3.select('#show-labels').on('change', function() {
    state.showLabels = this.checked;
    elements.g.selectAll('.node text')
      .transition()
      .duration(200)
      .style('opacity', state.showLabels ? 1 : 0)
      .on('end', function() {
        d3.select(this).style('display', state.showLabels ? 'block' : 'none');
      });
  });

  d3.select('#show-legend').on('change', function() {
    state.showLegend = this.checked;
    elements.colorLegend.classed('visible', state.showLegend);
    if (state.showLegend && state.data) updateLegend();
  });

  d3.select('#show-table').on('change', function() {
    state.showTable = this.checked;
    elements.tablePanel.classed('visible', state.showTable);
    if (state.showTable && state.data) updateTable();
    setTimeout(() => {
      if (!uiState.fullscreen) {
        const container = document.getElementById('viz-container');
        const rect = container.getBoundingClientRect();
        elements.svg.attr('width', rect.width).attr('height', rect.height);
        if (state.data) render();
      }
    }, 100);
  });

  // Label size slider
  d3.select('#label-size').on('input', function() {
    state.settings.labelSize = parseInt(this.value);
    d3.select('#label-size-value').text(this.value + 'px');
    elements.g.selectAll('.node text')
      .transition()
      .duration(100)
      .style('font-size', state.settings.labelSize + 'px');
  });

  // Edge length slider
  d3.select('#edge-length').on('input', function() {
    state.settings.edgeLength = parseInt(this.value);
    d3.select('#edge-length-value').text(this.value + 'px');
    if (state.data) render();
  });

  // Node size slider
  d3.select('#node-size').on('input', function() {
    state.settings.nodeSize = parseInt(this.value);
    d3.select('#node-size-value').text(this.value + 'px');
    if (state.data) render();
  });

  // Mutation font size slider
  d3.select('#mutation-font').on('input', function() {
    state.settings.mutationFontSize = parseFloat(this.value);
    d3.select('#mutation-font-value').text(this.value + 'px');
    if (state.data) render();
  });

  // Vertical spacing slider
  d3.select('#vertical-spacing').on('input', function() {
    state.settings.verticalSpacing = parseInt(this.value);
    d3.select('#vertical-spacing-value').text(this.value + 'px');
    if (state.data) render();
  });

  elements.tableSearch.on('input', debounce(function() {
    state.tableFilter = this.value.toLowerCase().trim();
    updateTable();
  }, 200));

  d3.selectAll('#data-table th').on('click', function() {
    const column = this.dataset.sort;
    if (!column) return;

    if (state.tableSort.column === column) {
      state.tableSort.direction = state.tableSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      state.tableSort.column = column;
      state.tableSort.direction = 'asc';
    }

    d3.selectAll('#data-table th')
      .classed('sorted-asc', false)
      .classed('sorted-desc', false);
    d3.select(this)
      .classed('sorted-asc', state.tableSort.direction === 'asc')
      .classed('sorted-desc', state.tableSort.direction === 'desc');

    updateTable();
  });

  d3.select('#download-csv').on('click', downloadCSV);

  // Clear selection on background click
  elements.svg.on('click', (event) => {
    if (event.target === elements.svg.node()) {
      state.selectedNodes.clear();
      elements.g.selectAll('.node').classed('selected', false);
      d3.selectAll('#data-table tr').classed('selected', false);
      updateInspector();
      updateClearButton();
    }
  });

  // Clear selection button
  d3.select('#clear-selection').on('click', function() {
    state.selectedNodes.clear();
    elements.g.selectAll('.node').classed('selected', false);
    d3.selectAll('#data-table tr').classed('selected', false);
    updateInspector();
    updateClearButton();
  });

  // Help overlay
  d3.select('#help-button').on('click', () => {
    d3.select('#help-overlay').classed('active', true);
  });

  d3.select('#close-help').on('click', () => {
    d3.select('#help-overlay').classed('active', false);
  });

  // Close on overlay click (not modal)
  d3.select('#help-overlay').on('click', function(event) {
    if (event.target === this) {
      d3.select(this).classed('active', false);
    }
  });

  // Close on Escape key
  d3.select(document).on('keydown', (event) => {
    if (event.key === 'Escape') {
      d3.select('#help-overlay').classed('active', false);
    }
  });


}

function updateClearButton() {
  const btn = d3.select('#clear-selection');
  if (state.selectedNodes.size > 0) {
    btn.property('disabled', false)
      .text(`Clear Selection (${state.selectedNodes.size})`);
  } else {
    btn.property('disabled', true)
      .text('Clear Selection');
  }
}

function setupResizablePanels() {
  // Make table panel resizable
  const tablePanel = document.getElementById('table-panel');
  const tableResizer = document.getElementById('table-resizer');

  if (tableResizer && tablePanel) {
    let isResizing = false;
    let startY, startHeight;

    tableResizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = tablePanel.offsetHeight;
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight - 200, startHeight + delta));
      tablePanel.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Re-render after resize
        setTimeout(() => {
          if (!uiState.fullscreen) {
            const container = document.getElementById('viz-container');
            const rect = container.getBoundingClientRect();
            elements.svg.attr('width', rect.width).attr('height', rect.height);
            if (state.data) render();
          }
        }, 50);
      }
    });
  }

  // Make inspector panel resizable
  const inspectorPanel = document.getElementById('inspector-panel');
  const inspectorResizer = document.getElementById('inspector-resizer');

  if (inspectorResizer && inspectorPanel) {
    let isResizing = false;
    let startX, startWidth;

    inspectorResizer.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = inspectorPanel.offsetWidth;
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const delta = startX - e.clientX;
      const newWidth = Math.max(250, Math.min(600, startWidth + delta));
      inspectorPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
}

// ===========================================
// Data Loading from GitHub
// ===========================================
async function loadData(lineage) {
  elements.loading.classed('hidden', false);
  elements.nodeCount.html('⏳ Fetching from GitHub...');

  const cacheKey = lineage;
  const lastFetchTime = state.lastFetch.get(cacheKey);
  const cachedData = state.dataCache.get(cacheKey);

  if (cachedData && lastFetchTime && (Date.now() - lastFetchTime < CACHE_DURATION)) {
    console.log(`Using cached data for ${lineage}`);
    state.data = cachedData;
    state.filteredData = null;
    onDataLoaded(lineage);
    return;
  }

  const repoName = LINEAGE_REPOS[lineage];
  if (!repoName) {
    elements.nodeCount.html(`✗ Unknown lineage: ${lineage}`);
    elements.loading.classed('hidden', true);
    return;
  }

  console.log(`Loading data for ${lineage} from ${repoName}`);

  try {
    const subcladeFiles = await getSubcladeFiles(repoName);
    console.log(`Found ${subcladeFiles.length} subclade files`);

    if (subcladeFiles.length === 0) {
      throw new Error('No subclade files found in repository');
    }

    elements.nodeCount.html(`⏳ Loading ${subcladeFiles.length} clades...`);

    const clades = await fetchAllSubclades(repoName, subcladeFiles);
    console.log(`Parsed ${clades.length} clades`);

    const data = buildDataFromClades(clades, lineage);
    data.repoName = repoName;
    data.repoUrl = `https://github.com/${GITHUB_ORG}/${repoName}`;

    state.dataCache.set(cacheKey, data);
    state.lastFetch.set(cacheKey, Date.now());

    state.data = data;
    state.filteredData = null;

    onDataLoaded(lineage);

  } catch (error) {
    console.error('Failed to load data:', error);
    elements.nodeCount.html(`✗ Failed to load: ${error.message}`);
    elements.loading.classed('hidden', true);
  }
}

async function getSubcladeFiles(repoName) {
  const url = `${GITHUB_API_BASE}/repos/${GITHUB_ORG}/${repoName}/contents/subclades`;
  console.log(`Fetching subclade list: ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    const altFolders = ['clades', 'clade', 'subclade'];
    for (const folder of altFolders) {
      const altUrl = `${GITHUB_API_BASE}/repos/${GITHUB_ORG}/${repoName}/contents/${folder}`;
      const altResponse = await fetch(altUrl);
      if (altResponse.ok) {
        const contents = await altResponse.json();
        return contents
          .filter(f => f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml')))
          .map(f => ({ name: f.name, path: f.path, download_url: f.download_url }));
      }
    }
    throw new Error(`Could not find subclades folder in ${repoName}`);
  }

  const contents = await response.json();
  return contents
    .filter(f => f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml')))
    .map(f => ({ name: f.name, path: f.path, download_url: f.download_url }));
}

async function fetchAllSubclades(repoName, files) {
  const clades = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batch = files.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(file => fetchSubcladeFile(file))
    );
    clades.push(...results.filter(c => c !== null));
  }

  return clades;
}

async function fetchSubcladeFile(file) {
  try {
    const response = await fetch(file.download_url);
    if (!response.ok) return null;
    const yaml = await response.text();
    return parseSubcladeYaml(yaml, file.name);
  } catch (error) {
    console.warn(`Error fetching ${file.name}:`, error);
    return null;
  }
}

// ===========================================
// YAML Parsing
// ===========================================
function parseSubcladeYaml(yaml, filename) {
  const cladeName = filename.replace(/\.ya?ml$/, '');

  const clade = {
    name: cladeName,
    parent: null,
    alias_of: null,
    unaliased_name: null,
    mutations: [],
    representatives: []
  };

  const lines = yaml.split('\n');
  let currentSection = null;
  let currentItem = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('name:')) {
      const match = trimmed.match(/name:\s*["']?([^"'\s#]+)["']?/);
      if (match) clade.name = match[1];
      continue;
    }

    if (trimmed.startsWith('parent:')) {
      const match = trimmed.match(/parent:\s*["']?([^"'\s#]+)["']?/);
      if (match) clade.parent = match[1];
      continue;
    }

    if (trimmed.startsWith('alias_of:')) {
      const match = trimmed.match(/alias_of:\s*["']?([^"'\s#]+)["']?/);
      if (match) clade.alias_of = match[1];
      continue;
    }

    if (trimmed.startsWith('unaliased_name:')) {
      const match = trimmed.match(/unaliased_name:\s*["']?([^"'\s#]+)["']?/);
      if (match) clade.unaliased_name = match[1];
      continue;
    }

    if (trimmed === 'defining_mutations:' || trimmed === 'mutations:') {
      saveCurrentItem();
      currentSection = 'mutations';
      currentItem = null;
      continue;
    }

    if (trimmed === 'representative_isolates:' || trimmed === 'representatives:') {
      saveCurrentItem();
      currentSection = 'representatives';
      currentItem = null;
      continue;
    }

    if (currentSection === 'mutations') {
      parseMutationLine(trimmed);
    } else if (currentSection === 'representatives') {
      parseRepresentativeLine(trimmed);
    }
  }

  saveCurrentItem();

  function saveCurrentItem() {
    if (currentItem) {
      if (currentSection === 'mutations' && (currentItem.position || currentItem.state)) {
        clade.mutations.push(currentItem);
      } else if (currentSection === 'representatives' && currentItem.isolate) {
        clade.representatives.push(currentItem);
      }
      currentItem = null;
    }
  }

  function parseMutationLine(trimmed) {
    if (trimmed.match(/^-\slocus:/)) {
      saveCurrentItem();
      const match = trimmed.match(/^-\slocus:\s*["']?([^"'\s#]+)["']?/);
      currentItem = { locus: match ? match[1] : 'nuc' };
      return;
    }

    if (trimmed.match(/^-\s*gene:/)) {
      saveCurrentItem();
      const match = trimmed.match(/^-\s*gene:\s*["']?([^"'\s#]+)["']?/);
      currentItem = { locus: match ? match[1] : 'nuc' };
      return;
    }

    const compactMatch = trimmed.match(/^-\s*["']?([A-Za-z0-9_]+):([A-Z-])?(\d+)([A-Z-])["']?/);
    if (compactMatch) {
      saveCurrentItem();
      clade.mutations.push({
        locus: compactMatch[1],
        from: compactMatch[2] || null,
        position: parseInt(compactMatch[3]),
        state: compactMatch[4]
      });
      return;
    }

    if (currentItem) {
      const posMatch = trimmed.match(/^position:\s*(\d+)/);
      if (posMatch) {
        currentItem.position = parseInt(posMatch[1]);
        return;
      }
      
      const stateMatch = trimmed.match(/^(?:state|to):\s*["']?([^"'\s#]+)["']?/);
      if (stateMatch) {
        currentItem.state = stateMatch[1];
        return;
      }
      
      const fromMatch = trimmed.match(/^from:\s*["']?([^"'\s#]+)["']?/);
      if (fromMatch) {
        currentItem.from = fromMatch[1];
        return;
      }
    }
  }

  function parseRepresentativeLine(trimmed) {
    if (trimmed.match(/-\s*(?:isolate|name|strain):/)) {
      saveCurrentItem();
      const match = trimmed.match(/-\s*(?:isolate|name|strain):\s*["']?(.+?)["']?\s*$/);
      currentItem = { isolate: match ? match[1].trim() : 'Unknown' };
      return;
    }

    if (trimmed.startsWith('-') && !trimmed.includes(':')) {
      saveCurrentItem();
      const match = trimmed.match(/^-\s*["']?(.+?)["']?\s*$/);
      if (match) {
        clade.representatives.push({ isolate: match[1].trim() });
      }
      return;
    }

    if (currentItem) {
      const accMatch = trimmed.match(/^accession:\s*["']?([^"'\s#]+)["']?/);
      if (accMatch) {
        currentItem.accession = accMatch[1];
      }
    }
  }

  return clade;
}

// ===========================================
// Dynamic Color Generation
// ===========================================
function generateCladeColors(clades, parentMap) {
  const colorAssignments = new Map();

  // Find all root clades and their depths
  const cladeNames = new Set(clades.map(c => c.name));

  // Calculate depth for each clade
  const depthMap = new Map();

  function getDepth(name, visited = new Set()) {
    if (depthMap.has(name)) return depthMap.get(name);
    if (visited.has(name)) return 0;
    visited.add(name);

    const parent = parentMap.get(name);
    if (!parent || !cladeNames.has(parent)) {
      depthMap.set(name, 0);
      return 0;
    }

    const depth = getDepth(parent, visited) + 1;
    depthMap.set(name, depth);
    return depth;
  }

  // Calculate depths
  clades.forEach(c => getDepth(c.name));

  // Group clades by their major clade (first segment or alias root)
  const majorCladeGroups = new Map();

  function getMajorClade(name) {
    const parts = name.split('.');
    return parts[0];
  }

  clades.forEach(c => {
    const major = getMajorClade(c.name);
    if (!majorCladeGroups.has(major)) {
      majorCladeGroups.set(major, []);
    }
    majorCladeGroups.get(major).push(c.name);
  });

  // Assign base colors to major clades
  const majorCladeColors = new Map();
  let colorIndex = 0;

  Array.from(majorCladeGroups.keys()).sort().forEach(major => {
    majorCladeColors.set(major, DEPTH_BASE_COLORS[colorIndex % DEPTH_BASE_COLORS.length]);
    colorIndex++;
  });

  // For each clade, generate a shade based on depth and sibling position
  clades.forEach(clade => {
    const name = clade.name;
    const major = getMajorClade(name);
    const baseColor = majorCladeColors.get(major);
    const depth = depthMap.get(name) || 0;

    // Get siblings at same depth under same parent
    const parent = parentMap.get(name);
    const siblings = clades.filter(c => parentMap.get(c.name) === parent);
    const siblingIndex = siblings.findIndex(c => c.name === name);
    const siblingCount = siblings.length;

    // Adjust lightness based on depth (deeper = slightly darker)
    // Adjust saturation based on sibling position
    const depthLightnessAdjust = Math.min(depth * 3, 15);
    const siblingSaturationAdjust = siblingCount > 1 ? 
      ((siblingIndex / (siblingCount - 1)) - 0.5) * 20 : 0;

    const h = baseColor.h;
    const s = Math.max(30, Math.min(90, baseColor.s + siblingSaturationAdjust));
    const l = Math.max(25, Math.min(70, baseColor.l - depthLightnessAdjust + (siblingIndex * 3)));

    colorAssignments.set(name, `hsl(${h}, ${s}%, ${l}%)`);
  });

  return colorAssignments;
}

// ===========================================
// Data Structure Building
// ===========================================
function buildDataFromClades(clades, lineage) {
  const nodes = [];
  const cladeNames = new Set(clades.map(c => c.name));
  const parentMap = new Map();

  // First pass: build parent map
  for (const clade of clades) {
    const name = clade.name;
    let parent = null;

    if (clade.parent && cladeNames.has(clade.parent)) {
      parent = clade.parent;
    } else if (clade.parent) {
      parent = clade.parent;
    } else {
      parent = inferParentFromName(name, cladeNames);
    }

    parentMap.set(name, parent);
  }

  // Generate colors
  const colorMap = generateCladeColors(clades, parentMap);

  // Second pass: build nodes
  for (const clade of clades) {
    const name = clade.name;
    const parent = parentMap.get(name);

    let aliasDisplay = clade.alias_of || clade.unaliased_name || name;
    if (aliasDisplay === name) {
      aliasDisplay = null;
    }

    nodes.push({
      id: name,
      parent: parent,
      alias: aliasDisplay,
      alias_of: clade.alias_of,
      unaliased_name: clade.unaliased_name,
      mutations: clade.mutations || [],
      representatives: clade.representatives || [],
      color: colorMap.get(name) || '#78909c'
    });
  }

  return {
    lineage: lineage,
    nodeCount: nodes.length,
    nodes: nodes,
    fetchedAt: new Date().toISOString()
  };
}

function inferParentFromName(name, cladeNames) {
  const parts = name.split('.');

  if (parts.length === 1) {
    return null;
  }

  for (let i = parts.length - 1; i >= 1; i--) {
    const potentialParent = parts.slice(0, i).join('.');
    if (cladeNames.has(potentialParent)) {
      return potentialParent;
    }
  }

  return null;
}

function onDataLoaded(lineage) {
  console.log(`Loaded ${state.data.nodeCount} clades for ${lineage}`);

  const displayName = LINEAGE_DISPLAY[lineage] || lineage;
  elements.mainTitle.text(`${displayName} Clade Hierarchy`);

  let statusHtml = `✓ Loaded ${state.data.nodeCount} clades`;
  if (state.data.repoName) {
    statusHtml += ` <small>from <a href="${state.data.repoUrl}" target="_blank">${state.data.repoName}</a></small>`;
  }
  elements.nodeCount.html(statusHtml);

  populateCladeFilter();
  render();

  if (state.showTable) {
    updateTable();
  }

  elements.loading.classed('hidden', true);
}

// ===========================================
// Tree Layout & Rendering
// ===========================================
function buildHierarchy(nodes) {
  const nodeMap = new Map(nodes.map(n => [n.id, { ...n, children: [] }]));
  const roots = [];

  for (const node of nodes) {
    const nodeObj = nodeMap.get(node.id);
    if (node.parent && nodeMap.has(node.parent)) {
      nodeMap.get(node.parent).children.push(nodeObj);
    } else {
      roots.push(nodeObj);
    }
  }

  const sortChildren = (node) => {
    if (node.children) {
      node.children.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      node.children.forEach(sortChildren);
    }
  };
  roots.forEach(sortChildren);

  if (roots.length > 1) {
    return { id: 'root', children: roots, isVirtualRoot: true };
  }

  if (roots.length === 0) {
    return { id: 'empty', children: [] };
  }

  return roots[0];
}

function render() {
  const nodes = state.filteredData || state.data.nodes;

  if (!nodes || nodes.length === 0) {
    console.warn('No nodes to render');
    elements.loading.classed('hidden', true);
    return;
  }

  const hierarchyData = buildHierarchy(nodes);
  const root = d3.hierarchy(hierarchyData);

  const container = document.getElementById('viz-container');
  const rect = container.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;

  const leafCount = root.leaves().length || 1;
  
  const nodeHeight = state.settings.verticalSpacing;

  const maxDepth = root.height || 1;
  const dynamicEdgeLength = Math.min(
    state.settings.edgeLength,
    (width - 200) / (maxDepth + 1)
  );

  const treeLayout = d3.tree()
    .nodeSize([nodeHeight, dynamicEdgeLength])
    .separation((a, b) => a.parent === b.parent ? 1 : 1.05);

  treeLayout(root);

  elements.g.selectAll('*').remove();

  let descendants = root.descendants();
  let links = root.links();

  if (hierarchyData.isVirtualRoot) {
    descendants = descendants.filter(d => !d.data.isVirtualRoot);
    links = links.filter(d => !d.source.data.isVirtualRoot);
  }

  // Draw links with transition
  const linkElements = elements.g.selectAll('.link')
    .data(links)
    .enter()
    .append('path')
    .attr('class', 'link')
    .attr('d', createOrthogonalPath)
    .attr('opacity', 0);
  
  linkElements.transition()
    .duration(400)
    .attr('opacity', 1);

  // Add mutation labels along edges
  const mutationLabels = elements.g.selectAll('.mutation-label')
    .data(links.filter(d => d.target.data.mutations && d.target.data.mutations.length > 0))
    .enter()
    .append('g')
    .attr('class', 'mutation-label')
    .style('opacity', 0)
    .style('display', uiState.showMutations ? 'block' : 'none');

  mutationLabels.each(function(d) {
    const g = d3.select(this);
    const midX = (d.source.y + d.target.y) / 2 + 5;
    const midY = (d.source.x + d.target.x) / 2;
    
    const mutations = d.target.data.mutations.slice(0, 5);
    const hasMore = d.target.data.mutations.length > 5;
    
    const fontSize = state.settings.mutationFontSize;
    const lineHeight = fontSize + 2;
    
    const totalHeight = (mutations.length + (hasMore ? 1 : 0)) * lineHeight;
    const startY = midY - totalHeight / 2;
    
    let maxWidth = 0;
    const textElements = [];
    
    mutations.forEach((m, i) => {
      const locus = m.locus || 'nuc';
      const pos = m.position || '?';
      const st = m.state || '?';
      const mutText = `${locus}:${pos}${st}`;
      
      const tempText = g.append('text')
        .attr('x', midX)
        .attr('y', startY + (i * lineHeight))
        .text(mutText)
        .style('font-size', `${fontSize}px`)
        .style('font-family', 'monospace');
      
      const bbox = tempText.node().getBBox();
      maxWidth = Math.max(maxWidth, bbox.width);
      textElements.push({ text: mutText, y: startY + (i * lineHeight), bbox: bbox });
      tempText.remove();
    });
    
    if (hasMore) {
      const tempText = g.append('text')
        .attr('x', midX)
        .attr('y', startY + (mutations.length * lineHeight))
        .text('...')
        .style('font-size', `${fontSize}px`)
        .style('font-family', 'monospace');
      
      const bbox = tempText.node().getBBox();
      maxWidth = Math.max(maxWidth, bbox.width);
      textElements.push({ text: '...', y: startY + (mutations.length * lineHeight), bbox: bbox });
      tempText.remove();
    }
    
    g.append('rect')
      .attr('x', midX - 2)
      .attr('y', startY - lineHeight/2)
      .attr('width', maxWidth + 4)
      .attr('height', totalHeight + 2)
      .attr('fill', 'rgba(255, 255, 255, 0.95)')
      .attr('stroke', 'rgba(200, 200, 200, 0.5)')
      .attr('stroke-width', 0.5)
      .attr('rx', 2);
    
    textElements.forEach(({ text, y }) => {
      g.append('text')
        .attr('x', midX)
        .attr('y', y)
        .attr('dy', '0.8em')
        .text(text)
        .style('font-size', `${fontSize}px`)
        .style('fill', '#333')
        .style('font-family', 'monospace')
        .style('font-weight', '400');
    });
  });

  mutationLabels.transition()
    .duration(400)
    .style('opacity', uiState.showMutations ? 1 : 0);

  // Draw nodes with transition
  const nodeGroups = elements.g.selectAll('.node')
    .data(descendants)
    .enter()
    .append('g')
    .attr('class', d => {
      let classes = 'node';
      if (state.searchMatches.has(d.data.id)) classes += ' highlighted';
      if (state.selectedNodes.has(d.data.id)) classes += ' selected';
      return classes;
    })
    .attr('transform', d => `translate(${d.y},${d.x})`)
    .attr('opacity', 0)
    .on('mouseover', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip)
    .on('click', handleNodeClick);

  nodeGroups.transition()
    .duration(400)
    .attr('opacity', 1);

  const nodeSize = state.settings.nodeSize;

  nodeGroups.append('circle')
    .attr('r', 0)
    .attr('fill', d => d.data.color || '#78909c')
    .attr('stroke', d => state.searchMatches.has(d.data.id) ? '#e53935' : 'white')
    .attr('stroke-width', d => state.searchMatches.has(d.data.id) ? 3 : 2)
    .transition()
    .duration(400)
    .attr('r', d => state.searchMatches.has(d.data.id) ? nodeSize + 2 : nodeSize);

  nodeGroups.append('text')
    .attr('dx', nodeSize + 4)
    .attr('dy', 3)
    .text(d => d.data.id)
    .each(function(d) {
      const textNode = this;
      const bbox = textNode.getBBox();
      
      const parent = textNode.parentNode;
      const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      
      bgRect.setAttribute('x', bbox.x - 2);
      bgRect.setAttribute('y', bbox.y - 1);
      bgRect.setAttribute('width', bbox.width + 4);
      bgRect.setAttribute('height', bbox.height + 2);
      bgRect.setAttribute('fill', 'rgba(255, 255, 255, 0.85)');
      bgRect.setAttribute('rx', 2);
      bgRect.setAttribute('class', 'label-background');
      
      parent.insertBefore(bgRect, textNode);
    })
    .style('font-size', state.settings.labelSize + 'px')
    .style('display', state.showLabels ? 'block' : 'none')
    .attr('opacity', 0)
    .transition()
    .duration(400)
    .attr('opacity', state.showLabels ? 1 : 0);

  centerView(root, width, height, hierarchyData.isVirtualRoot);
}

function createOrthogonalPath(d) {
  const sourceX = d.source.y;
  const sourceY = d.source.x;
  const targetX = d.target.y;
  const targetY = d.target.x;

  const midX = (sourceX + targetX) / 2;
  const radius = Math.min(8, Math.abs(targetY - sourceY) / 2, Math.abs(midX - sourceX) / 2);

  if (radius < 2 || Math.abs(targetY - sourceY) < 2) {
    return `M${sourceX},${sourceY} L${midX},${sourceY} L${midX},${targetY} L${targetX},${targetY}`;
  }

  const dir = targetY > sourceY ? 1 : -1;

  return `
    M${sourceX},${sourceY}
    L${midX - radius},${sourceY}
    Q${midX},${sourceY} ${midX},${sourceY + dir * radius}
    L${midX},${targetY - dir * radius}
    Q${midX},${targetY} ${midX + radius},${targetY}
    L${targetX},${targetY}
  `.replace(/\s+/g, ' ').trim();
}

function centerView(root, width, height, hasVirtualRoot) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  root.descendants().forEach(d => {
    if (!d.data.isVirtualRoot) {
      minX = Math.min(minX, d.x);
      maxX = Math.max(maxX, d.x);
      minY = Math.min(minY, d.y);
      maxY = Math.max(maxY, d.y);
    }
  });

  if (!isFinite(minX) || !isFinite(maxX)) {
    minX = 0; maxX = 100;
    minY = 0; maxY = 100;
  }

  const padding = 100;

  const treeWidth = maxY - minY + padding;
  const treeHeight = maxX - minX + padding;

  // Calculate scale to fit, but allow scrolling if tree is too tall
  const scaleX = (width - padding) / treeWidth;
  const scaleY = (height - padding) / treeHeight;
  
  // Don't force-fit if tree is taller than viewport - let it scroll
  const scale = Math.min(scaleX, Math.min(scaleY, 1), 1.2);

  const translateX = (width - treeWidth * scale) / 2 - minY * scale + padding/2;
  
  // Center vertically if tree fits, otherwise start from top
  let translateY;
  if (treeHeight * scale < height) {
    translateY = (height - treeHeight * scale) / 2 - minX * scale + padding/2;
  } else {
    translateY = padding/2 - minX * scale;
  }

  const transform = d3.zoomIdentity
    .translate(translateX, translateY)
    .scale(Math.max(0.2, scale));

  elements.svg.transition()
    .duration(500)
    .call(elements.zoom.transform, transform);
}

// ===========================================
// Interactions
// ===========================================
function showTooltip(event, d) {
  const node = d.data;

  let mutationsHtml = '';
  if (node.mutations && node.mutations.length > 0) {
    const muts = node.mutations.slice(0, 4).map(m => {
      const locus = m.locus || 'nuc';
      const pos = m.position || '?';
      const st = m.state || '?';
      return `<span class="mutation-tag">${locus}:${pos}${st}</span>`;
    }).join('');
    const more = node.mutations.length > 4 ? `<br><em>+${node.mutations.length - 4} more</em>` : '';
    mutationsHtml = `<div class="tooltip-mutations"><strong>Mutations:</strong><br>${muts}${more}</div>`;
  }

  let aliasInfo = '';
  if (node.alias_of) {
    aliasInfo = `<div class="tooltip-row"><span class="tooltip-label">Alias of:</span> ${node.alias_of}</div>`;
  } else if (node.alias) {
    aliasInfo = `<div class="tooltip-row"><span class="tooltip-label">Full name:</span> ${node.alias}</div>`;
  }

  elements.tooltip.html(`
    <div class="tooltip-title" style="border-left: 3px solid ${node.color || '#999'}; padding-left: 8px;">
      ${node.id}
    </div>
    <div class="tooltip-row"><span class="tooltip-label">Parent:</span> ${node.parent || 'Root'}</div>
    ${aliasInfo}
    ${mutationsHtml}
  `).classed('visible', true);

  moveTooltip(event);
}

function moveTooltip(event) {
  const tooltipNode = elements.tooltip.node();
  const tooltipRect = tooltipNode.getBoundingClientRect();

  let left = event.clientX + 15;
  let top = event.clientY - 10;

  if (left + tooltipRect.width > window.innerWidth - 20) {
    left = event.clientX - tooltipRect.width - 15;
  }
  if (top + tooltipRect.height > window.innerHeight - 20) {
    top = event.clientY - tooltipRect.height - 10;
  }
  if (top < 10) top = 10;

  elements.tooltip
    .style('left', `${left}px`)
    .style('top', `${top}px`);
}

function hideTooltip() {
  elements.tooltip.classed('visible', false);
}

function handleNodeClick(event, d) {
  event.stopPropagation();

  const node = d.data;
  const nodeId = node.id;

  // Multi-select with Ctrl/Cmd key
  if (event.ctrlKey || event.metaKey) {
    if (state.selectedNodes.has(nodeId)) {
      state.selectedNodes.delete(nodeId);
    } else {
      state.selectedNodes.add(nodeId);
    }
  } else {
    // Single select
    state.selectedNodes.clear();
    state.selectedNodes.add(nodeId);
  }

  // Update visual selection
  elements.g.selectAll('.node')
    .classed('selected', n => state.selectedNodes.has(n.data.id));

  d3.selectAll('#data-table tr')
    .classed('selected', function() {
      return state.selectedNodes.has(this.dataset.clade);
    });

  updateInspector();
  updateClearButton();
}

function selectCladeFromTable(cladeId, event) {
  const nodes = state.filteredData || state.data.nodes;
  const node = nodes.find(n => n.id === cladeId);

  if (node) {
    // Multi-select with Ctrl/Cmd key
    if (event && (event.ctrlKey || event.metaKey)) {
      if (state.selectedNodes.has(cladeId)) {
        state.selectedNodes.delete(cladeId);
      } else {
        state.selectedNodes.add(cladeId);
      }
    } else {
      state.selectedNodes.clear();
      state.selectedNodes.add(cladeId);
    }

    elements.g.selectAll('.node')
      .classed('selected', n => state.selectedNodes.has(n.data.id));

    d3.selectAll('#data-table tr')
      .classed('selected', function() {
        return state.selectedNodes.has(this.dataset.clade);
      });

    updateInspector();
    updateClearButton();
  }
}

function updateInspector() {
  if (state.selectedNodes.size === 0) {
    elements.inspectorContent.html(`
      <div class="inspector-placeholder">
        <p>Click on a clade node to view details</p>
        <p class="hint">Hold Ctrl/Cmd to select multiple clades</p>
      </div>
    `);
    return;
  }

  const nodes = state.filteredData || state.data.nodes;
  const selectedNodeData = nodes.filter(n => state.selectedNodes.has(n.id));

  if (selectedNodeData.length === 1) {
    // Single node selected
    const node = selectedNodeData[0];

    const mutationsHtml = node.mutations && node.mutations.length > 0
      ? node.mutations.map(m => {
          const locus = m.locus || 'nuc';
          const pos = m.position || '?';
          const st = m.state || '?';
          return `<span class="mutation-tag">${locus}:${pos}${st}</span>`;
        }).join('')
      : '<span class="empty-text">No defining mutations</span>';

    const representativesHtml = node.representatives && node.representatives.length > 0
      ? node.representatives.map(r => 
          `<span class="isolate-tag">${r.isolate || 'Unknown'}</span>`
        ).join('')
      : '<span class="empty-text">No representative isolates</span>';

    let namingHtml = '';
    if (node.alias_of) {
      namingHtml = `<p>Alias of: <strong>${node.alias_of}</strong></p>`;
    }
    if (node.unaliased_name) {
      namingHtml += `<p>Full path: <strong>${node.unaliased_name}</strong></p>`;
    }

    elements.inspectorContent.html(`
      <div class="inspector-clade-header" style="border-left-color: ${node.color || '#999'};">
        <h4>${node.id}</h4>
        <p>Parent: <strong>${node.parent || 'Root'}</strong></p>
        ${namingHtml}
      </div>
      <div class="inspector-section">
        <h5>Defining Mutations (${node.mutations?.length || 0})</h5>
        <div class="mutations-list">${mutationsHtml}</div>
      </div>
      <div class="inspector-section">
        <h5>Representative Isolates (${node.representatives?.length || 0})</h5>
        <div class="representatives-list">${representativesHtml}</div>
      </div>
    `);

  } else {
    // Multiple nodes selected - show comparison view
    const totalMutations = selectedNodeData.reduce((sum, n) => sum + (n.mutations?.length || 0), 0);
    const totalReps = selectedNodeData.reduce((sum, n) => sum + (n.representatives?.length || 0), 0);

    // Find common mutations
    const mutationCounts = new Map();
    selectedNodeData.forEach(node => {
      (node.mutations || []).forEach(m => {
        const key = `${m.locus || 'nuc'}:${m.position || '?'}${m.state || '?'}`;
        mutationCounts.set(key, (mutationCounts.get(key) || 0) + 1);
      });
    });

    const commonMutations = Array.from(mutationCounts.entries())
      .filter(([_, count]) => count === selectedNodeData.length)
      .map(([key, _]) => key);

    const nodeListHtml = selectedNodeData.map(n => `
      <div class="multi-select-node" style="border-left: 3px solid ${n.color || '#999'};">
        <strong>${n.id}</strong>
        <span class="node-stats">${n.mutations?.length || 0} mutations, ${n.representatives?.length || 0} reps</span>
      </div>
    `).join('');

    const commonMutationsHtml = commonMutations.length > 0
      ? commonMutations.map(m => `<span class="mutation-tag common">${m}</span>`).join('')
      : '<span class="empty-text">No mutations in common</span>';

    elements.inspectorContent.html(`
      <div class="inspector-multi-header">
        <h4>${selectedNodeData.length} Clades Selected</h4>
        <p>Total: ${totalMutations} mutations, ${totalReps} representatives</p>
      </div>
      <div class="inspector-section">
        <h5>Selected Clades</h5>
        <div class="multi-select-list">${nodeListHtml}</div>
      </div>
      <div class="inspector-section">
        <h5>Common Mutations (${commonMutations.length})</h5>
        <div class="mutations-list">${commonMutationsHtml}</div>
      </div>
    `);
  }
}

// ===========================================
// Search & Filter
// ===========================================
function handleSearch(query) {
  state.searchMatches.clear();

  if (!query) {
    elements.searchResults.text('').attr('class', 'search-results');
    render();
    updateTable();
    return;
  }

  const nodes = state.filteredData || state.data.nodes;
  const matches = nodes.filter(n => n.id.toLowerCase().includes(query));

  if (matches.length > 0) {
    matches.forEach(m => state.searchMatches.add(m.id));
    const displayText = matches.length <= 5
      ? `Found: ${matches.map(m => m.id).join(', ')}`
      : `Found ${matches.length} matches`;
    elements.searchResults.text(displayText).attr('class', 'search-results has-results');
  } else {
    elements.searchResults.text('No matches found').attr('class', 'search-results no-results');
  }

  render();
  updateTable();
}

function filterToClade(cladeId) {
  if (!cladeId) {
    state.filteredData = null;
    render();
    updateTable();
    return;
  }

  const descendants = new Set([cladeId]);

  const children = new Map();
  state.data.nodes.forEach(n => {
    if (n.parent) {
      if (!children.has(n.parent)) children.set(n.parent, []);
      children.get(n.parent).push(n.id);
    }
  });

  const queue = [cladeId];
  while (queue.length > 0) {
    const current = queue.shift();
    const childNodes = children.get(current) || [];
    childNodes.forEach(child => {
      descendants.add(child);
      queue.push(child);
    });
  }

  state.filteredData = state.data.nodes.filter(n => descendants.has(n.id));
  render();
  updateTable();
}

function populateCladeFilter() {
  const clades = state.data.nodes.map(n => n.id).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  elements.cladeFilter.selectAll('option.clade-option').remove();

  elements.cladeFilter.selectAll('option.clade-option')
    .data(clades)
    .enter()
    .append('option')
    .attr('class', 'clade-option')
    .attr('value', d => d)
    .text(d => d);
}

function updateLegend() {
  const nodes = state.filteredData || state.data.nodes;

  // Group by major clade
  const majorClades = new Map();
  nodes.forEach(n => {
    const major = n.id.split('.')[0];
    if (!majorClades.has(major)) {
      majorClades.set(major, n.color);
    }
  });

  const legendData = Array.from(majorClades.entries())
    .map(([clade, color]) => ({ clade, color }))
    .sort((a, b) => a.clade.localeCompare(b.clade));

  elements.colorLegend.selectAll('.legend-item').remove();

  elements.colorLegend.selectAll('.legend-item')
    .data(legendData)
    .enter()
    .append('div')
    .attr('class', 'legend-item')
    .html(d => `
      <div class="legend-color" style="background-color: ${d.color};"></div>
      <span>${d.clade}.*</span>
    `);
}

// ===========================================
// Table Functions
// ===========================================
function formatMutationsForTable(mutations) {
  if (!mutations || mutations.length === 0) return '-';

  return mutations.map(m => {
    const locus = m.locus || 'nuc';
    const pos = m.position || '?';
    const st = m.state || '?';
    return `<span class="mutation-tag">${locus}:${pos}${st}</span>`;
  }).join('');
}

function formatMutationsForCSV(mutations) {
  if (!mutations || mutations.length === 0) return '';

  return mutations.map(m => {
    const locus = m.locus || 'nuc';
    const pos = m.position || '?';
    const st = m.state || '?';
    return `${locus}:${pos}${st}`;
  }).join('; ');
}

function updateTable() {
  if (!state.showTable || !state.data) return;

  let nodes = state.filteredData || state.data.nodes;

  if (state.tableFilter) {
    nodes = nodes.filter(n =>
      n.id.toLowerCase().includes(state.tableFilter) ||
      (n.alias && n.alias.toLowerCase().includes(state.tableFilter)) ||
      (n.parent && n.parent.toLowerCase().includes(state.tableFilter))
    );
  }

  const sortedNodes = [...nodes].sort((a, b) => {
    let aVal, bVal;

    switch (state.tableSort.column) {
      case 'clade':
        aVal = a.id;
        bVal = b.id;
        break;
      case 'parent':
        aVal = a.parent || '';
        bVal = b.parent || '';
        break;
      case 'alias':
        aVal = a.alias || '';
        bVal = b.alias || '';
        break;
      case 'mutCount':
        aVal = a.mutations?.length || 0;
        bVal = b.mutations?.length || 0;
        break;
      case 'repCount':
        aVal = a.representatives?.length || 0;
        bVal = b.representatives?.length || 0;
        break;
      default:
        aVal = a.id;
        bVal = b.id;
    }

    if (typeof aVal === 'number') {
      return state.tableSort.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
    return state.tableSort.direction === 'asc' ? cmp : -cmp;
  });

  elements.tableBody.selectAll('tr').remove();

  const rows = elements.tableBody.selectAll('tr')
    .data(sortedNodes)
    .enter()
    .append('tr')
    .attr('data-clade', d => d.id)
    .classed('highlighted', d => state.searchMatches.has(d.id))
    .classed('selected', d => state.selectedNodes.has(d.id))
    .on('click', function(event, d) {
      selectCladeFromTable(d.id, event);
    });

  rows.append('td')
    .html(d => `<span class="clade-link" style="border-left: 3px solid ${d.color}; padding-left: 6px;">${d.id}</span>`);

  rows.append('td')
    .text(d => d.parent || 'Root');

  rows.append('td')
    .text(d => d.alias || '-');

  rows.append('td')
    .attr('class', 'mutations-cell')
    .html(d => formatMutationsForTable(d.mutations));

  rows.append('td')
    .text(d => d.mutations?.length || 0);

  rows.append('td')
    .text(d => d.representatives?.length || 0);
}

function downloadCSV() {
  const nodes = state.filteredData || state.data.nodes;

  const headers = ['Clade', 'Parent', 'Alias', 'Defining Mutations', '# Mutations', '# Representatives'];

  const rows = nodes.map(n => [
    n.id,
    n.parent || 'Root',
    n.alias || '',
    formatMutationsForCSV(n.mutations),
    n.mutations?.length || 0,
    n.representatives?.length || 0
  ]);

  const escapeCSV = (val) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `influenza_${state.currentLineage}_clades.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ===========================================
// Utilities
// ===========================================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ===========================================
// Start Application
// ===========================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}