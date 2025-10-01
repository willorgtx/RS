function getCategorySlug(name) {
  return name.split(' ').map(encodeURIComponent).join('+');
}
function getCategoryName(slug) {
  return slug.split('+').map(decodeURIComponent).join(' ');
}

// --- hyphen/space normalization helpers ---

// Title-case only alphanumeric words; keep punctuation like "/" intact.
function titleCaseWords(s) {
  return String(s).replace(/\b([A-Za-z0-9]+)\b/g, m => m[0].toUpperCase() + m.slice(1).toLowerCase());
}

function dedupe(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function dedupeLoose(arr) {
  const out = []
  , seen = new Set();
  const key = v => {
    const raw = String(v ?? '').trim();
    if (!raw)
      return '';

    const lower = raw.toLowerCase();
    const sizeish = lower.replace(/[×]/g, 'x');
    // If the value looks like a size (numbers/quotes around an x), collapse whitespace/punctuation
    if (/(?:\d|['"′″])\s*x\s*(?:\d|['"′″])/.test(sizeish)) {
      return sizeish.replace(/[^0-9a-z]+/g, '');
    }

    return lower.replace(/[\s-]+/g, '-');
  };
  for (const v of (arr || []).filter(Boolean)) {
    const k = key(v);
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(String(v));
    }
  }
  return out;
}

// Create matching variants from a URL value (single or array):
// - Title-cased spaced variant (hyphens → spaces)
// - Title-cased hyphen variant (spaces → hyphens)
// We keep punctuation like "/" so "sisal / jute" still matches your real facet.
function normalizeFromUrlSingle(valueOrArray) {
  const values = Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray];
  const out = [];
  for (const raw of values) {
    if (!raw)
      continue;
    const s = String(raw).replace(/\+/g, ' ').trim();

    // Special handling for price groups - preserve hyphens for price ranges
    if (/^\$?\d+-\$?\d+$/.test(s)) {
      out.push(s);
      continue;
    }

    const variants = new Set();
    const base = titleCaseWords(s.replace(/-/g, ' ')).replace(/\s+/g, ' ').trim();
    if (base)
      variants.add(base);

    // Add dimension variants (e.g., 6x9 → 6 x 9, 6' x 9') to match stored facet values
    const sizeCandidate = s.replace(/[×]/g, 'x');
    const sizeParts = sizeCandidate.split(/x/i).map(part => part.trim()).filter(Boolean);
    const sizeLike = sizeParts.length >= 2 && sizeParts.every(part => /^[0-9'"′″\s\/.:-]+$/.test(part));
    if (sizeLike) {
      const normalizedParts = sizeParts.map(part => part.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
      const joinParts = delim => normalizedParts.join(delim).replace(/\s+/g, ' ').trim();
      const collapsed = normalizedParts.join('x').replace(/\s+/g, '');

      if (normalizedParts.length) {
        const spaced = joinParts(' x ');
        const spacedUpper = joinParts(' X ');
        if (spaced)
          variants.add(spaced);
        if (spacedUpper)
          variants.add(spacedUpper);
        if (collapsed)
          variants.add(collapsed);

        const hasQuote = normalizedParts.some(part => /['"′″]/.test(part));
        const isPlainNumber = part => /^\d+(?:\s*\d\/\d)?$/.test(part);
        if (!hasQuote && normalizedParts.every(isPlainNumber)) {
          const withFeetParts = normalizedParts.map(part => `${part}'`);
          const withFeet = withFeetParts.join(' x ');
          const withFeetUpper = withFeetParts.join(' X ');
          if (withFeet)
            variants.add(withFeet);
          if (withFeetUpper)
            variants.add(withFeetUpper);
        }
      }
    }

    // Keep the raw trimmed value as a fallback
    if (s)
      variants.add(s);

    for (const v of variants) {
      const finalValue = String(v).replace(/\s+/g, ' ').trim();
      if (finalValue)
        out.push(finalValue);
    }
  }
  return dedupeLoose(out);
}

// Prefer hyphenated params in the URL, but don't make ugly slugs when punctuation is present.
// If value contains punctuation other than hyphen, leave it as-is (ex: "Sisal / Jute").
function canonicalizeForUrl(v) {
  const str = String(v || '');

  // Special handling for price groups - preserve them as-is
  const isPriceGroup = /^\$?\d+-\$?\d+$/.test(str);
  if (isPriceGroup) {
    return str;
  }

  const hasOtherPunct = /[^A-Za-z0-9\s-]/.test(str);
  // e.g., "/", "&", ","
  if (hasOtherPunct)
    return str;
  // keep readable (e.g., "Sisal / Jute")
  return str.trim().replace(/\s+/g, '-').replace(/--+/g, '-');
}

function canonicalizeArrayForUrl(arr) {
  // dedupe before and after canonicalization
  const a = dedupeLoose(arr || []).map(canonicalizeForUrl);
  return dedupeLoose(a);
}

/* 1 — grab the query string (?q=blue%20rug) */
const params = new URLSearchParams(window.location.search);
const initialQuery = params.get('q') || '';

const {liteClient: algoliasearch} = window['algoliasearch/lite'];
const searchClient = algoliasearch('6Z7PXO4P9V', 'cf6feac06fa1069b5dd3ed1b02b7fbcf');

// === Auto-facet from query — config & helpers ===
const AUTOFACET_ATTRS = [
  'attributes.Colors',
  'attributes.MaterialCategory',
  'attributes.Origin',
  'attributes.Size',
  'attributes.Styles',
  'manufacturer',
  'attributes.Weave',
];
const _auto_vocabByAttr = {};       // { attr -> Map<normVal -> originalFacetValue> }
let   _auto_vocabReady   = false;   // gate so we don't loop while fetching
let   _auto_inHook       = false;   // loop guard in queryHook


// Normalizer: “6 x 9” / “6×9” → “6x9”, trims & lowercases, collapses spaces
function _auto_norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[’']/g, '')     // feet/quote marks
    .replace(/×/g, 'x')       // unicode ×
    .replace(/\s*x\s*/g, 'x') // tight sizes
    .replace(/\s+/g, ' ')
    .trim();
}
// Build the facet vocab from the latest results instead of SFFV
function _auto_buildVocabFromLastResults() {
  const res = search?.helper?.lastResults;
  if (!res) return;

  for (const attr of AUTOFACET_ATTRS) {
  let hits = [];
  try {
  // returns [{ name, count, isRefined }, ...] or throws if facet unknown
  hits = res.getFacetValues(attr) || [];
  } catch (_) {
  hits = [];
  }
  const m = new Map();
  for (const h of hits) {
  if (!h || !h.name) continue;
  m.set(_auto_norm(h.name), String(h.name));
  }
  _auto_vocabByAttr[attr] = m;
  }

  // Mark ready if we got anything at all
  _auto_vocabReady = Object.values(_auto_vocabByAttr).some(m => m && m.size);
  }

  // Find which facet values appear in the user’s query
  function _auto_extractRefinements(query) {
  if (!_auto_vocabReady) return [];
  const nq = _auto_norm(query);
  const found = [];
  for (const attr of AUTOFACET_ATTRS) {
  const vocab = _auto_vocabByAttr[attr];
  if (!vocab) continue;
  for (const [nVal, original] of vocab.entries()) {
  if (nq.includes(nVal)) {
  found.push({ attr, value: original, nVal });
}
}
}
// de-dupe by attr+value
const key = o => `${o.attr}::${o.value}`;
return Array.from(new Map(found.map(o => [key(o), o])).values());
}

// NEW — apply once from the current query after vocab preloads
let _auto_appliedOnce = false;
function _auto_applyFromCurrentQuery() {
  if (_auto_appliedOnce || !_auto_vocabReady) return;

  const q = search?.helper?.state?.query || '';
  if (!q) return;

  const matches = _auto_extractRefinements(q);
  if (!matches.length) return;

  let changed = false;
  for (const { attr, value } of matches) {
  const already =
        (search.helper.state.disjunctiveFacetsRefinements?.[attr] || []).includes(value) ||
        (search.helper.state.facetsRefinements?.[attr] || []).includes(value);
  if (!already) {
  search.helper.addDisjunctiveFacetRefinement(attr, value);
  changed = true;
  }
  }

  // strip tokens so the facet remains removable
  let stripped = _auto_norm(q);
  for (const { nVal } of matches) {
  stripped = stripped.replace(new RegExp(`\\b${nVal}\\b`, 'g'), ' ')
.replace(/\s+/g, ' ')
.trim();
}

_auto_appliedOnce = true;
if (changed) {
search.helper.setQuery(stripped).search();
}
}


//helper to detect refinements
function hasAnyRefinements() {
const s = search.helper?.state;
if (!s) return false;

const hasVals = obj => Object.values(obj || {}).some(v =>
Array.isArray(v) ? v.length > 0 : Object.keys(v || {}).length > 0
);

return (
hasVals(s.facetsRefinements) ||
hasVals(s.disjunctiveFacetsRefinements) ||
hasVals(s.hierarchicalFacetsRefinements) ||
hasVals(s.numericRefinements) ||
(s.tagRefinements && s.tagRefinements.length > 0)
);
}


// Ensure a stable Algolia Insights user token across sessions
(function ensureInsightsUser() {
try {
const KEY = 'ALGOLIA_USER_TOKEN';
const LEGACY_KEY = 'alg_user';
// you already use this elsewhere
let token = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);

if (!token) {
token = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + '.' + Date.now();
}

localStorage.setItem(KEY, token);
localStorage.setItem(LEGACY_KEY, token);
// keep your existing code working
if (window.aa)
aa('setUserToken', token);
// make it active for Insights
} catch (_) {/* no-op */
}
}
)();
// ---- Robust router for /search?... including /search/?brands=Safavieh ----
const ATTR_FROM_URL = {
// URL key     // refinementList attribute name in your widgets
brands: 'brands',
weaves: 'weaves',
styles: 'styles',
colors: 'colors',
sizes: 'sizes',
origin: 'origin',
materialcategory: 'materialcategory',
pricegroup: 'pricegroup',
promos: 'promos',
};
// Friendly sort slugs ↔ index names
const SORT_ROUTE_TO_INDEX = {
relevance: 'product_index',
price_low: 'product_index_price_asc',
price_high: 'product_index_price_desc',
newest: 'product_index_newest',
};
const SORT_INDEX_TO_ROUTE = Object.entries(SORT_ROUTE_TO_INDEX).reduce( (acc, [k,v]) => (acc[v] = k,
acc), {});
const search = instantsearch({
indexName: 'product_index',
searchClient,
routing: {
router: instantsearch.routers.history({
windowTitle({category, query}) {
const queryTitle = query ? `RugStudio Results for "${query}"` : 'Search';

if (category) {
return `${category} – ${queryTitle}`;
}

return queryTitle;
},

createURL({qsModule, location, routeState}) {
const baseUrl = `${location.origin}/`;
  const categoryPath = '';
  // your existing categoryPath logic

  const queryParameters = {};
  // Write `q` instead of `query`
  if (routeState.query)
  queryParameters.q = routeState.query;

  if (routeState.brand)
  queryParameters.brands = routeState.brand;
  if (routeState.weave)
  queryParameters.weaves = routeState.weave;
  if (routeState.style)
  queryParameters.styles = routeState.style;
  if (routeState.color)
  queryParameters.colors = routeState.color;
  if (routeState.size)
  queryParameters.sizes = routeState.size;
  if (routeState.origin)
  queryParameters.origin = routeState.origin;
  if (routeState.price)
  queryParameters.pricegroup = routeState.price;
  if (routeState.material)
  queryParameters.materialcategory = routeState.material;
  if (routeState.promo)
  queryParameters.promos = routeState.promo;

  // include sort in the URL when selected
  if (routeState.sortBy)
  queryParameters.sortBy = routeState.sortBy;
  if (routeState.sort)
  queryParameters.sort = routeState.sort;

  const queryString = qsModule.stringify(queryParameters, {
  addQueryPrefix: true,
        arrayFormat: 'repeat'
});

return `${baseUrl}search/${categoryPath}${queryString}`;
},

  parseURL({qsModule, location}) {
    const pathnameMatches = location.pathname.match(/search\/(.*?)\/?$/);
    const category = getCategoryName((pathnameMatches && pathnameMatches[1]) || '');

    // Read `q` (fallback to `query` for safety)
    const params = qsModule.parse(location.search.slice(1));
    const rawQ = params.q ?? params.query ?? '';
    const theQuery = Array.isArray(rawQ) ? rawQ[0] : rawQ;

    const brands = params.brands ?? [];
    const weaves = params.weaves ?? [];
    const styles = params.styles ?? [];
    const colors = params.colors ?? [];
    const sizes = params.sizes ?? [];
    const origin = params.origin ?? [];
    const pricegroup = params.pricegroup ?? [];
    const materialcategory = params.materialcategory ?? [];
    const promos = params.promos ?? [];

    // Accept canonical ?sortBy=index as well as a friendly ?sort=newest
    const sort = params.sort || (params.sortBy ? SORT_INDEX_TO_ROUTE[params.sortBy] : undefined);

    const arr = v => (Array.isArray(v) ? v : [v].filter(Boolean));

    return {
      query: theQuery,
      page: params.page,
      brands: normalizeFromUrlSingle(brands),
      weaves: normalizeFromUrlSingle(weaves),
      styles: normalizeFromUrlSingle(styles),
      sizes: normalizeFromUrlSingle(sizes),
      colors: normalizeFromUrlSingle(colors),
      origin: normalizeFromUrlSingle(origin),
      price: normalizeFromUrlSingle(pricegroup),
      material: normalizeFromUrlSingle(materialcategory),
      promo: normalizeFromUrlSingle(promos),
      sort,
    };
  }
}),
  stateMapping: {
    stateToRoute(uiState) {
      const s = uiState.product_index || {};
      const rl = s.refinementList || {};

      return {
        // keep using `query` here; your createURL already writes it to `q`
        query: s.query || '',
        page: s.page || 1,
        sort: SORT_INDEX_TO_ROUTE[s.sortBy],
        // singular keys — these are what your existing createURL expects
        brand: canonicalizeArrayForUrl(rl.manufacturer || []),
        weave: canonicalizeArrayForUrl(rl['attributes.Weave'] || []),
        style: canonicalizeArrayForUrl(rl['attributes.Styles'] || []),
        size: canonicalizeArrayForUrl(rl['attributes.Size'] || []),
        price: canonicalizeArrayForUrl(rl['attributes.PriceGroup'] || []),
        promo: canonicalizeArrayForUrl(rl['attributes.Promotion'] || []),
        color: canonicalizeArrayForUrl(rl['attributes.Colors'] || []),
        origin: canonicalizeArrayForUrl(rl['attributes.Origin'] || []),
        material: canonicalizeArrayForUrl(rl['attributes.MaterialCategory'] || []),
      };
    },

      routeToState(route) {
        return {
          product_index: {
            // parseURL gives you `query`; createURL writes it to `q`
            query: route.query || '',
            page: route.page || 1,
            sortBy: route.sort ? SORT_ROUTE_TO_INDEX[route.sort] : undefined,
            // map URL params → actual attribute names used by your widgets
            refinementList: {
              manufacturer: normalizeFromUrlSingle(route.brands || route.brand || []),
              'attributes.Weave': normalizeFromUrlSingle(route.weaves || route.weave || []),
              'attributes.Styles': normalizeFromUrlSingle(route.styles || route.style || []),
              'attributes.Size': normalizeFromUrlSingle(route.sizes || route.size || []),
              'attributes.PriceGroup': normalizeFromUrlSingle(route.price || route.pricegroup || []),
              'attributes.Promotion': normalizeFromUrlSingle(route.promo || route.promos || []),
              'attributes.Colors': normalizeFromUrlSingle(route.colors || route.color || []),
              'attributes.Origin': normalizeFromUrlSingle(route.origin || []),
              'attributes.MaterialCategory': normalizeFromUrlSingle(route.material || route.materialcategory || []),
            },
          },
        };
      },
  },
},

  insights: true,

    /* Keep the first query in sync */
    /*initialUiState: {
      product_index: {
        query: initialQuery
      }
    }*/
});

const {infiniteHits} = instantsearch.widgets;
const {createInfiniteHitsSessionStorageCache} = instantsearch;
const sessionStorageCache = createInfiniteHitsSessionStorageCache();

const rugPadsExclude = 'NOT categories.name:"Rug Pads"' + ' AND NOT categories.name:"Karastan-Rug-Pad"' + ' AND NOT categories.name:"Rugstudio-Rug-Pads"';
//const customStats = connectStats(renderStats);

function _taggedTemplateLiteral(strings, raw) {
  return raw || (raw = strings.slice(0)),
    Object.freeze(Object.defineProperties(strings, {
    raw: {
      value: Object.freeze(raw)
    }
  }))
}
function cleanTitle(title) {
  return title.replace(/(Area Rug(?: Clearance| Last Chance)?\| Size\| )/, ' ').trim();
}
function truncateText(text, maxLength) {
  if (!text)
    return '';
  return text.length > maxLength ? text.substring(0, maxLength).trim() + '…' : text;
}

let showChildPrices = false;

search.addWidgets([instantsearch.widgets.searchBox({
  container: '#searchbox',
  placeholder: 'Find the perfect rug',
  autofocus: true,
  showSubmit: false,
  searchAsYouType: true,
  queryHook(query, refine) {
    const normalized = query.trim().toLowerCase();

    // Your existing rug-pad redirect logic
    if (['rug pad', 'rug pads', 'jade pad', 'msm', 'cushion grip', 'magic stop', 'anchor pad', 'deluxe pad', 'non slip pad', 'non-slip pads'].includes(normalized)) {
      window.location.href = '/rugstudio-rug-pads.html';
      return;
    }

    // Prevent recursive loop
    if (_auto_inHook) {
      _auto_inHook = false;
      return refine(query);
    }

    // If vocab not ready yet, just run the search
    if (!_auto_vocabReady || !query) {
      return refine(query);
    }

    // Find facet values inside the query
    const matches = _auto_extractRefinements(query);

    if (matches.length) {
      // Apply as real refinements (so the boxes are checked and removable)
      let changed = false;
      for (const { attr, value } of matches) {
        const already =
              (search.helper.state.disjunctiveFacetsRefinements?.[attr] || []).includes(value) ||
               (search.helper.state.facetsRefinements?.[attr] || []).includes(value);
               if (!already) {
               // All six attributes are on refinementList widgets (disjunctive)
               search.helper.addDisjunctiveFacetRefinement(attr, value);
               changed = true;
               }
               }

               // Strip the matched tokens out of the query so they don’t re-apply
               let stripped = _auto_norm(query);
               // remove whole-token occurrences; keep simple for now
               for (const { nVal } of matches) {
               stripped = stripped.replace(new RegExp(`\\b${nVal}\\b`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

_auto_inHook = true;
// Use the stripped query; the applied facets now show up as checked pills/boxes
return refine(stripped);
}

// No auto matches; continue as normal
refine(query);
}
}), instantsearch.widgets.stats({
container: '#stats',
templates: {
text(data, {html}) {
let count = '';

if (data.hasManyResults) {
const formattedHits = data.nbHits.toLocaleString('en-US');
count += `${formattedHits} results`;
} else if (data.hasOneResult) {
count += `1 result`;
} else {
count += `no result`;
}
return html`<span>${count}</span>`;
               }
               }
               }), instantsearch.widgets.currentRefinements({
               container: '#current-refinements',

               /* show ONLY the facets you expose elsewhere */
               includedAttributes: ['manufacturer', 'attributes.Styles', 'attributes.Size', 'attributes.PriceGroup', 'attributes.MaterialCategory', 'attributes.Colors', 'attributes.Weave', 'attributes.Promotion'],

               /* optional: rename long attribute paths for nicer labels */
               transformItems(items) {
                return items.map(item => ({
                  ...item,
                  label: item.label // “attributes.Size” → “Size”
                  .replace(/^manufacturer$/, 'Brand').replace(/^attributes\./, '').replace(/([A-Z])/g, ' $1').trim()
                }));
              },

                /* optional: tweak the pill template */
                templates: {
                  item({label, refinements, refine}, {html}) {
                    return html`
<span class="refinement-label">${label}</span>
${refinements.map(refinement => html`
<span class="refinement-pill">
${refinement.label}
<button
type="button"
aria-label="Remove ${refinement.label}"
onClick=${ () => refine(refinement)}
>✕</button>
</span>
`)}
`;
                  }
                }
      }), instantsearch.widgets.sortBy({
        container: '#sort-by',
        items: [{
          value: 'product_index',
          label: 'Relevance'
        }, {
          value: 'product_index_price_asc',
          label: 'Price (low → high)'
        }, {
          value: 'product_index_price_desc',
          label: 'Price (high → low)'
        }, {
          value: 'product_index_newest',
          label: 'Newest'
        }]
      }), instantsearch.widgets.infiniteHits({
        container: '#infinite-hits',
        templates: {
          item(hit, {html, components, sendEvent}) {
            const resizedImage = hit.image //? hit.image.replace('f_auto%2Cq_auto', 'f_auto%2Cq_auto%2Cw_250')
            ? hit.image.replace('f_auto%2Cq_auto', 'if_tar_gt_1.5/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:15/if_else/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:1/if_end').replace('/s_', '/l_') : null;
            const isParent = hit.custom_flag1 === 1;
            const titleText = cleanTitle(hit.title);
            const displayTitle = isParent ? truncateText(titleText, 40) : titleText;

            // NEW — build PDP URL with queryID + clickedID (+ index)
            const baseUrl = hit.url || `/store/p/${hit.objectID}.aspx`;
            const u = new URL(baseUrl, location.origin);
            if (hit.__queryID) u.searchParams.set('queryID', hit.__queryID);   // attribution
            u.searchParams.set('clickedID', String(hit.objectID));              // exact thing that was clicked (parent or child)
            // Try multiple approaches to get the current index
            let currentIndex = hit.__indexName;
            if (!currentIndex) {
              // Try to get from search helper state
              currentIndex = search.helper.state.sortBy;
            }
            if (!currentIndex) {
              // Try to get from URL parameters
              const urlParams = new URLSearchParams(window.location.search);
              const sortParam = urlParams.get('sort');
              if (sortParam) {
                const sortMapping = {
                  'relevance': 'product_index',
                  'price_low': 'product_index_price_asc',
                  'price_high': 'product_index_price_desc',
                  'newest': 'product_index_newest'
                };
                currentIndex = sortMapping[sortParam];
              }
            }
            if (!currentIndex) {
              currentIndex = 'product_index';
            }

            // console.log('[template] Hit index info:', {
            //   hitIndexName: hit.__indexName,
            //   currentIndex: currentIndex,
            //   sortBy: search.helper.state.sortBy,
            //   urlSort: new URLSearchParams(window.location.search).get('sort')
            // });
            u.searchParams.set('index', currentIndex);    // optional but nice to have
            const augmentedHref = u.toString();

            return html`
<div class="hit-card" onClick=${ () => {
              if (hit.__queryID) {
                localStorage.setItem(`alg_ctx_${hit.objectID}`, JSON.stringify({
                  qid: hit.__queryID,
                  pos: hit.__position
                }));
                sendEvent('click', hit, 'Product Clicked');
              }
            }
          }>
<a class="hit-link" href="${augmentedHref}" rel="noopener">
${resizedImage ? html`<img class="hit-img" src="${resizedImage}" alt="${hit.title}" width="250" />` : ''}
<div class="titlewrapper"><h2>${displayTitle}</h2></div>
<div class="ByMfgr">By ${hit.manufacturer}</div>
${showChildPrices && !isParent && hit.sale_price ? html`<div class="hitPrice">$${Number(hit.sale_price).toFixed(2)}</div>` : ''}
</a>
</div>
`;
          },
          empty(results, {html}) {
            return html`<div class="no-results-container">No results for "${results.query}"</div>
<div id="trending-items"></div>`;
          },
        },

        transformItems(items, {results}) {
          // console.log('[blend]', {
          //   page: results.page,
          //   query: results.query,
          //   trending: trendingHits.length
          // });

          // Add the correct index name to each hit
          // Try to get the index from results.index first, then fall back to sortBy
          const currentIndex = results.index || search.helper.state.sortBy || 'product_index';
          // console.log('[transformItems] Current sort state:', {
          //   sortBy: search.helper.state.sortBy,
          //   currentIndex: currentIndex,
          //   resultsIndex: results.index
          // });

          const itemsWithIndex = items.map(hit => ({
            ...hit,
            __indexName: currentIndex
          }));

          // Only pad on first page, empty query, and NO refinements
          const isFirstPage   = results.page === 0;
          const isEmptyQuery  = (results.query ?? '').trim() === '';
          const hasRefinements = hasAnyRefinements();
          const isDefaultIndex = results.index === 'product_index'; // adjust name if needed

          if (!isFirstPage || !isEmptyQuery || hasRefinements || !isDefaultIndex || trendingHits.length === 0) {
            return itemsWithIndex;
          }

          // Remove any items that are already in trending
          const filtered = itemsWithIndex.filter(x => !trendingIDs.has(x.objectID));

          // Give the trending hits positions & queryID so Insights works
          const qid = results.queryID;
          // requires clickAnalytics: true
          const trendingAug = trendingHits.slice(0, TRENDING_N).map( (h, i) => ({
            ...h,
            __position: i + 1,
            __queryID: qid,
            __indexName: currentIndex
          }));

          // Prepend, then cap to hitsPerPage so the grid size stays the same
          return [...trendingAug, ...filtered].slice(0, results.hitsPerPage);

        },
        cache: sessionStorageCache,
        loadMore: '<button type="button" class="ais-InfiniteHits-loadMore">Show more results</button>',
      }), instantsearch.widgets.clearRefinements({
        container: '#clear-refinements',
      }), instantsearch.widgets.refinementList({
        container: '#brand-list',
        attribute: 'manufacturer',
        showMore: true,
        limit: 5,
        showMoreLimit: 200,
        // or however many you want to allow 
        templates: {
          showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
        }
      }), instantsearch.widgets.refinementList({
        container: '#style-list',
        attribute: 'attributes.Styles',
        showMore: true,
        limit: 5,
        showMoreLimit: 20,
        // or however many you want to allow
        templates: {
          showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
        }
      }), instantsearch.widgets.refinementList({
        container: '#promotion-list',
        attribute: 'attributes.Promotion',
        showMore: false,
        limit: 3,
        //showMoreLimit: 20, // or however many you want to allow
        //templates: {
        //showMoreText: ({ isShowingMore }) =>
        //isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
        //}
      }), instantsearch.widgets.refinementList({
        container: '#size-list',
        attribute: 'attributes.Size',
        showMore: true,
        limit: 5,
        showMoreLimit: 200,
        templates: {
          showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
        },
        // or however many you want to allow
        transformItems(items, {results}) {
          // 1 — collect filters that came from Rules
          const autoFacetFilters = results?.explain?.params?.rules?.facetFilters || [];

          // 2 — clone every item and force-refine when needed
          return items.map( (item) => {
          const key = `attributes.Size:${item.value}`;
return {
...item,
// ← spread (no asterisks)
isRefined: item.isRefined || autoFacetFilters.includes(key)
};
}
);
},
templates: {
showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}), instantsearch.widgets.refinementList({
container: '#price-list',
attribute: 'attributes.PriceGroup',
}), instantsearch.widgets.refinementList({
container: '#material-list',
attribute: 'attributes.MaterialCategory',
showMore: true,
limit: 4,
showMoreLimit: 20,
// or however many you want to allow
templates: {
showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}), instantsearch.widgets.refinementList({
container: '#color-list',
attribute: 'attributes.Colors',
showMore: true,
limit: 5,
showMoreLimit: 20,
// or however many you want to allow
templates: {
showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}), instantsearch.widgets.refinementList({
container: '#weave-list',
attribute: 'attributes.Weave',
showMore: true,
limit: 5,
showMoreLimit: 20,
// or however many you want to allow
transformItems(items) {
const facetFilters = (search.helper.lastResults?.explain?.params?.rules?.facetFilters || []).map(s => s.toLowerCase());
return items.map(item => {
const key = `attributes.Weave:${item.value}`.toLowerCase();
return {
...item,
isRefined: item.isRefined || facetFilters.includes(key)
};
}
);
},
templates: {
showMoreText: ({isShowingMore}) => isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}), instantsearch.widgets.configure({
hitsPerPage: 16,
filters: 'hide = 0 AND custom_flag1 = 1' + ' AND NOT categories.name:"Rug Pads"' + ' AND NOT categories.name:"Karastan-Rug-Pad"' + ' AND NOT categories.name:"Rugstudio-Rug-Pads"',
//query: initialQuery,
clickAnalytics: true,
//getRankingInfo: true,
//explain: ['*'] // <-- tells Algolia to include rule info
}), ]);

const TRENDING_N = 16;
let trendingHits = [];
let trendingIDs = new Set();

searchClient.getRecommendations({
requests: [{
model: 'trending-items',
threshold: 60,
indexName: 'product_index',
maxRecommendations: TRENDING_N,
queryParameters: {
filters: 'custom_flag1=1 AND hide=0 AND NOT categories.name:"Rug Pads"' + ' AND NOT categories.name:"Karastan-Rug-Pad" AND NOT categories.name:"Rugstudio-Rug-Pads" AND NOT manufacturer:"Solo Rugs" AND NOT attributes.Promotion:"LAST CHANCE"'
}
}]
}).then(({ results }) => {
trendingHits = results?.[0]?.hits ?? [];
trendingIDs = new Set(trendingHits.map(h => h.objectID));
// console.log('Trending blend candidates:', trendingHits.length, trendingHits);
//search?.refresh?.();
})
.catch(console.error)
.finally(() => { search.start(); });

let showingChildren = false;

search.on('render', () => {
const q = (search.helper.state.query || '').trim();
// Build vocab from the current results, then apply from initial ?q=...
_auto_buildVocabFromLastResults();
if (_auto_vocabReady && !_auto_appliedOnce) _auto_applyFromCurrentQuery();  
const isChildSku = /^\d+x\d+$/i.test(q);
// 262081x1, 262081X2 …

const sizeRefinements = search.helper.getRefinements('attributes.Size');
const autoSizeFromRule = search.renderState?.product_index?.results?.explain?.params?.rules?.facetFilters?.some(f => f.startsWith('attributes.Size:')) || false;


// update the existing flag (DON’T redeclare)
showChildPrices = sizeRefinements.length > 0 || autoSizeFromRule || isChildSku;
const wantChildren = showChildPrices; // your existing logic decides this
const baseFilters = ['hide = 0'];
const parentFilter = 'custom_flag1 = 1';
const childFilter = 'custom_flag1 = 0';

const newFilterString = [...baseFilters, wantChildren ? childFilter : parentFilter, rugPadsExclude].join(' AND ');

if (wantChildren !== showingChildren || search.helper.state.filters !== newFilterString) {
  showingChildren = wantChildren;
  search.helper.setQueryParameter('filters', newFilterString).search();
}

const results = search.renderState?.product_index?.infiniteHits?.results;
const hits = results?.hits || [];
const queryID = results?.queryID;
const noResults = document.querySelector('#infinite-hits .ais-InfiniteHits--empty');

//console.log("results " + results);
//console.log("hits " + hits);
//console.log("queryID " + queryID);

//if (queryID) {
aa('viewedObjectIDs', {
eventName: 'Hits Viewed',
index: search.helper.state.sortBy || 'product_index',
objectIDs: hits.map(hit => hit.objectID),
//queryID: queryID, //queryID isn't required in Hits Viewed
//userToken: localStorage.alg_user || 'anonymous'
});
//}

if (noResults) {
const container = document.querySelector('#trending-items');
if (!container)
return;

// prevent multiple mounts across renders
if (!container.dataset.widgetMounted) {
container.dataset.widgetMounted = '1';

const {trendingItems} = instantsearch.widgets;

search.addWidgets([trendingItems({
container: '#trending-items',
// show global trends; limit to 8
limit: 8,
// keep visibility rules aligned with your main search
queryParameters: {
filters: 'hide=0 AND custom_flag1=1 AND NOT categories.name:"Rug Pads"',
clickAnalytics: true,
},
templates: {
// match your image + title logic (lines ~302–333)
item(reco, {html}) {
const rawImg = reco.image || reco.image_url || (reco.images && reco.images[0] && reco.images[0].url);

const resizedImage = rawImg ? rawImg.replace('f_auto%2Cq_auto', 'if_tar_gt_1.5/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:15/if_else/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:1/if_end').replace('/s_', '/l_') : null;

const isParent = reco.custom_flag1 === 1;
const titleText = cleanTitle(reco.title || reco.name || `Item ${reco.objectID}`);
const displayTitle = isParent ? truncateText(titleText, 40) : titleText;
const showPrice = showChildPrices && !isParent && reco.sale_price;

return html`
  <div class="hit-card"><a class="trending-item" href="${reco.url || '#'}" 
  rel="noopener"onClick="${ () => {
  if (window.aa) {
    aa('clickedObjectIDs', {
      eventName: 'Trending Clicked',
      index: search.helper.state.sortBy || 'product_index',
      objectIDs: [reco.objectID]
    });
  }
        }
      }">
                                               ${resizedImage ? html`<img class="hit-img" src="${resizedImage}" alt="${displayTitle}" width="250" />` : ''}
                                               <div class="titlewrapper"><h2 class="trending-title">${displayTitle}</h2></div>
                                               <div class="ByMfgr">By ${reco.manufacturer || ''}</div>
                                               ${showPrice ? html`<div class="hitPrice">$${Number(reco.sale_price).toFixed(2)}</div>` : ''}
        </a></div>
          `;
},
},
transformItems(items) {
// hide the section if the model is empty
if (!items || !items.length) {
const sec = document.querySelector('#trending-section');
if (sec)
sec.style.display = 'none';
}
return items;
},
}), ]);

// Mount the newly added widget immediately
search.refresh();
}
}

}
);

document.addEventListener('DOMContentLoaded', () => {
const observer = new MutationObserver( () => {
// Patch Load More button
const loadMoreButton = document.querySelector('.ais-InfiniteHits-loadMore');
if (loadMoreButton && !loadMoreButton.hasAttribute('type')) {
loadMoreButton.setAttribute('type', 'button');
}

// Patch Show More buttons
document.querySelectorAll('.ais-RefinementList-showMore').forEach(btn => {
if (!btn.hasAttribute('type')) {
btn.setAttribute('type', 'button');
}

// Add blur handler only once
if (!btn.dataset.blurAttached) {
btn.addEventListener('click', () => btn.blur());
btn.dataset.blurAttached = 'true';
}
}
);
}
);

// Start observing the body for dynamic widgets
observer.observe(document.body, {
childList: true,
subtree: true
});
}
);
