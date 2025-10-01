const { liteClient: algoliasearch } = window['algoliasearch/lite'];
const searchClient = algoliasearch(
  '6Z7PXO4P9V',
  'cf6feac06fa1069b5dd3ed1b02b7fbcf'
);

// === User Token Management (from search-results.js) ===
(function ensureInsightsUser() {
  try {
    const KEY = 'ALGOLIA_USER_TOKEN';
    const LEGACY_KEY = 'alg_user';
    let token = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEY);

    if (!token) {
      token = (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)) + '.' + Date.now();
    }

    localStorage.setItem(KEY, token);
    localStorage.setItem(LEGACY_KEY, token);
    
    if (window.aa) {
      aa('setUserToken', token);
    }
  } catch (_) {/* no-op */}
})();

// === Utility Functions ===
function cleanTitle(title) {
  return title
    .replace(/(Area Rug(?: Clearance| Last Chance)?\| Size\| )/, ' ')
    .trim();
}

function truncateText(text, maxLength) {
  if (!text) return '';
  return text.length > maxLength
    ? text.substring(0, maxLength).trim() + '…'
    : text;
}

// === Smart Query Selection ===
function extractMeaningfulTerms(keywords) {
  return keywords
    .map(k => k.toLowerCase().trim())
    .filter(k => {
      // Remove overly specific brand+product combos (e.g., "Safavieh Shag Multi")
      if (/^[a-z]+ [a-z]+ [a-z]+/.test(k)) return false;
      // Keep terms that contain common rug descriptors or are short (2 words or less)
      return /(shag|wool|silk|area|runner|round|square|braided|oriental|persian|modern|traditional|rug)/.test(k) || 
             k.split(' ').length <= 2;
    })
    .map(k => k.replace(/rugs?|area/gi, '').trim()) // Remove 'rug'/'rugs'/'area' from terms (case-insensitive)
    .filter(k => k.length > 0) // Remove empty terms after rug removal
    .slice(0, 3); // Limit to 3 most relevant terms
}

function scoreMetaKeywords(keywords) {
  if (!keywords.length) return 0;
  
  const avgLength = keywords.reduce((sum, k) => sum + k.length, 0) / keywords.length;
  const hasSpecificBrands = keywords.some(k => /^[A-Z][a-z]+ [A-Z]/.test(k));
  const hasCommonTerms = keywords.some(k => /(shag|wool|silk|area)/i.test(k));
  
  // Lower score for very specific brand+product combinations
  let score = hasCommonTerms ? 0.7 : 0.3;
  if (hasSpecificBrands) score *= 0.5;
  if (avgLength > 20) score *= 0.8; // Penalize overly long keywords
  
  return score;
}

function scoreUrlSlug(slug) {
  if (!slug) return 0;
  
  const commonTerms = ['shag', 'wool', 'silk', 'area', 'runner', 'braided', 'oriental', 'persian'];
  const hasCommonTerms = commonTerms.some(term => slug.includes(term));
  const wordCount = slug.split('-').length;
  
  // Higher score for common terms, moderate score for reasonable word count
  let score = hasCommonTerms ? 0.8 : 0.6;
  if (wordCount > 4) score *= 0.7; // Penalize overly long slugs
  
  return score;
}

function createOptimizedQuery(metaKeywords, urlSlug) {
  const metaScore = scoreMetaKeywords(metaKeywords);
  const slugScore = scoreUrlSlug(urlSlug);
  
  console.log('Query scoring:', { metaScore, slugScore, metaKeywords, urlSlug });
  
  // If meta keywords score well, use meaningful terms from them
  if (metaScore > slugScore && metaScore > 0.4) {
    const meaningfulTerms = extractMeaningfulTerms(metaKeywords);
    if (meaningfulTerms.length > 0) {
      return meaningfulTerms.join(' ');
    }
  }
  
  // Fall back to URL slug (converted to readable format, removing redundant 'rug'/'area' terms)
  return urlSlug.replace(/[-_]/g, ' ').replace(/rugs?|area/gi, '').trim();
}

// === URL Slug Extraction ===
function getUrlSlug() {
  const segments = window.location.pathname
    .replace(/\/$/, '')
    .split('/');
  return segments.pop() || '';
}

// === URL Parameter Helpers (from search-results.js) ===
function dedupe(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function dedupeLoose(arr) {
  const out = [];
  const seen = new Set();
  const key = v => {
    const raw = String(v ?? '').trim();
    if (!raw) return '';

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

function titleCaseWords(s) {
  return String(s).replace(/\b([A-Za-z0-9]+)\b/g, m => m[0].toUpperCase() + m.slice(1).toLowerCase());
}

function normalizeFromUrlSingle(valueOrArray) {
  const values = Array.isArray(valueOrArray) ? valueOrArray : [valueOrArray];
  const out = [];
  for (const raw of values) {
    if (!raw) continue;
    const s = String(raw).replace(/\+/g, ' ').trim();

    // Special handling for price groups - preserve hyphens for price ranges
    if (/^\$?\d+-\$?\d+$/.test(s)) {
      out.push(s);
      continue;
    }

    const variants = new Set();
    const base = titleCaseWords(s.replace(/-/g, ' ')).replace(/\s+/g, ' ').trim();
    if (base) variants.add(base);

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
        if (spaced) variants.add(spaced);
        if (spacedUpper) variants.add(spacedUpper);
        if (collapsed) variants.add(collapsed);

        const hasQuote = normalizedParts.some(part => /['"′″]/.test(part));
        const isPlainNumber = part => /^\d+(?:\s*\d\/\d)?$/.test(part);
        if (!hasQuote && normalizedParts.every(isPlainNumber)) {
          const withFeetParts = normalizedParts.map(part => `${part}'`);
          const withFeet = withFeetParts.join(' x ');
          const withFeetUpper = withFeetParts.join(' X ');
          if (withFeet) variants.add(withFeet);
          if (withFeetUpper) variants.add(withFeetUpper);
        }
      }
    }

    if (s) variants.add(s);

    for (const v of variants) {
      const finalValue = String(v).replace(/\s+/g, ' ').trim();
      if (finalValue) out.push(finalValue);
    }
  }
  return dedupeLoose(out);
}

function canonicalizeForUrl(v) {
  const str = String(v || '');
  
  // Special handling for price groups - preserve them as-is
  const isPriceGroup = /^\$?\d+-\$?\d+$/.test(str);
  if (isPriceGroup) {
    return str;
  }
  
  const hasOtherPunct = /[^A-Za-z0-9\s-]/.test(str);
  if (hasOtherPunct) return str;
  
  return str.trim().replace(/\s+/g, '-').replace(/--+/g, '-');
}

function canonicalizeArrayForUrl(arr) {
  const a = dedupeLoose(arr || []).map(canonicalizeForUrl);
  return dedupeLoose(a);
}

// === Sort Mapping Constants ===
const SORT_ROUTE_TO_INDEX = {
  relevance: 'product_index',
  price_low: 'product_index_price_asc',
  price_high: 'product_index_price_desc',
  newest: 'product_index_newest',
};
const SORT_INDEX_TO_ROUTE = Object.entries(SORT_ROUTE_TO_INDEX).reduce((acc, [k,v]) => (acc[v] = k, acc), {});

// === Main Execution ===
(async function() {
  const indexName = 'product_index';
  
  // 1. Extract data from page
  const meta = document.querySelector('meta[name="keywords"]')?.content || '';
  const keywords = meta.split(',').map(s => s.trim()).filter(Boolean);
  const urlSlug = getUrlSlug();
  
  // 2. Create optimized query (single query approach)
  const optimizedQuery = createOptimizedQuery(keywords, urlSlug);
  
  console.log('Landing page optimization:', {
    originalKeywords: keywords,
    urlSlug,
    optimizedQuery
  });

  // 3. Initialize InstantSearch with optimized query and clean URL routing
  const search = instantsearch({
    indexName,
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
          const baseUrl = `${location.origin}${location.pathname}`;
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

          return `${baseUrl}${queryString}`;
        },

        parseURL({qsModule, location}) {
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
    insights: true
  });

  const {
    sortBy,
    infiniteHits,
    clearRefinements,
    refinementList,
    configure
  } = instantsearch.widgets;

  const sessionStorageCache = instantsearch.createInfiniteHitsSessionStorageCache();

  search.addWidgets([
    sortBy({
      container: '#sort-by',
      items: [
        { value: 'product_index', label: 'Relevance' },
        { value: 'product_index_price_asc', label: 'Price (low → high)' },
        { value: 'product_index_price_desc', label: 'Price (high → low)' }
      ]
    }),

    infiniteHits({
      container: '#infinite-hits',
      cache: sessionStorageCache,
      loadMore: '<button type="button" class="ais-InfiniteHits-loadMore">Show more results</button>',
      templates: {
        item(hit, { html, sendEvent }) {
          const resizedImage = hit.image
            ? hit.image
              .replace('f_auto%2Cq_auto', 'if_tar_gt_1.5/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:15/if_else/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:1/if_end')
              .replace('/s_', '/l_')
            : null;
          
          const isParent = hit.custom_flag1 === 1;
          const titleText = cleanTitle(hit.title);
          const displayTitle = isParent
            ? truncateText(titleText, 40)
            : titleText;

          // === Enhanced URL with Analytics (from search-results.js) ===
          const baseUrl = hit.url || `/store/p/${hit.objectID}.aspx`;
          const u = new URL(baseUrl, location.origin);
          
          if (hit.__queryID) {
            u.searchParams.set('queryID', hit.__queryID);   // attribution
          }
          u.searchParams.set('clickedID', String(hit.objectID)); // exact thing clicked
          
          // Get current index
          let currentIndex = hit.__indexName;
          if (!currentIndex) {
            currentIndex = search.helper.state.sortBy;
          }
          if (!currentIndex) {
            currentIndex = 'product_index';
          }
          u.searchParams.set('index', currentIndex);
          
          const augmentedHref = u.toString();

          return html`
            <div class="hit-card" onClick=${() => {
              if (hit.__queryID) {
                localStorage.setItem(
                  `alg_ctx_${hit.objectID}`,
                  JSON.stringify({ qid: hit.__queryID, pos: hit.__position })
                );
              }
              sendEvent('click', hit, 'Product Clicked');
            }}>
              <a class="hit-link" href="${augmentedHref}" rel="noopener">
                ${resizedImage
                  ? html`<img class="hit-img" src="${resizedImage}" alt="${hit.title}" width="250" />`
                  : ''}
                <div class="titlewrapper"><h2>${displayTitle}</h2></div>
                <div class="ByMfgr">By ${hit.manufacturer}</div>
                ${showChildPrices && !isParent && hit.sale_price
                  ? html`<div class="hitPrice">$${Number(hit.sale_price).toFixed(2)}</div>`
                  : ''}
              </a>
            </div>
          `;
        },
        empty(results, { html }) {
          return html`<div>No results for "${results.query}"</div>`;
        }
      }
    }),

    clearRefinements({ container: '#clear-refinements' }),

    refinementList({
      container: '#brand-list',
      attribute: 'manufacturer',
      showMore: true,
      limit: 5,
      showMoreLimit: 20,
      templates: {
        showMoreText: ({ isShowingMore }) =>
          isShowingMore
            ? '<span class="facetshowless"></span>Show Less'
            : '<span class="facetshowmore"></span>Show more'
      }
    }),

    refinementList({
      container: '#style-list',
      attribute: 'attributes.Styles',
      showMore: true,
      limit: 5,
      showMoreLimit: 20,
      templates: {
        showMoreText: ({ isShowingMore }) =>
          isShowingMore
            ? '<span class="facetshowless"></span>Show Less'
            : '<span class="facetshowmore"></span>Show more'
      }
    }),

    refinementList({
      container: '#size-list',
      attribute: 'attributes.Size',
      showMore: true,
      limit: 5,
      showMoreLimit: 20,
      transformItems(items, { results }) {
        const autoFacetFilters =
          results?.explain?.params?.rules?.facetFilters || [];
        return items.map(item => {
          const key = `attributes.Size:${item.value}`;
          return {
            ...item,
            isRefined: item.isRefined || autoFacetFilters.includes(key)
          };
        });
      },
      templates: {
        showMoreText: ({ isShowingMore }) =>
          isShowingMore
            ? '<span class="facetshowless"></span>Show Less'
            : '<span class="facetshowmore"></span>Show more'
      }
    }),

    refinementList({
      container: '#price-list',
      attribute: 'attributes.PriceGroup'
    }),

    refinementList({
      container: '#material-list',
      attribute: 'attributes.MaterialCategory',
      showMore: true,
      limit: 4,
      showMoreLimit: 20,
      templates: {
        showMoreText: ({ isShowingMore }) =>
          isShowingMore
            ? '<span class="facetshowless"></span>Show Less'
            : '<span class="facetshowmore"></span>Show more'
      }
    }),

    refinementList({
      container: '#color-list',
      attribute: 'attributes.Colors',
      showMore: true,
      limit: 5,
      showMoreLimit: 20,
      templates: {
        showMoreText: ({ isShowingMore }) =>
          isShowingMore
            ? '<span class="facetshowless"></span>Show Less'
            : '<span class="facetshowmore"></span>Show more'
      }
    }),

    refinementList({
      container: '#weave-list',
      attribute: 'attributes.Weave',
      showMore: true,
      limit: 5,
      showMoreLimit: 20,
      templates: {
        showMoreText: ({ isShowingMore }) =>
          isShowingMore
            ? '<span class="facetshowless"></span>Show Less'
            : '<span class="facetshowmore"></span>Show more'
      }
    }),

    configure({
      query: optimizedQuery, // Use our optimized query
      clickAnalytics: true,
      getRankingInfo: true,
      explain: ['*'],
      removeWordsIfNoResults: 'allOptional',
      hitsPerPage: 16,
      filters: 'custom_flag1 = 1 AND hide = 0'
    })
  ]);

  search.start();

  // === Enhanced Analytics (from search-results.js) ===
  let showChildPrices = false;
  search.on('render', () => {
    const q = (search.helper.state.query || '').trim();
    const isChildSku = /^\d+x\d+$/i.test(q);
    const sizeRefs = search.helper.getRefinements('attributes.Size');
    const autoSizeRule = search.renderState
      ?.product_index
      ?.results
      ?.explain
      ?.params
      ?.rules
      ?.facetFilters
      ?.some(f => f.startsWith('attributes.Size:')) || false;
    
    showChildPrices = sizeRefs.length > 0 || autoSizeRule || isChildSku;

    const baseFilters = ['hide = 0'];
    const parentFilter = 'custom_flag1 = 1';
    const childFilter = 'custom_flag1 = 0';
    const desiredFilter = showChildPrices ? childFilter : parentFilter;
    const newFilterString = [...baseFilters, desiredFilter].join(' AND ');

    if (search.helper.state.filters !== newFilterString) {
      search.helper
        .setQueryParameter('filters', newFilterString)
        .search();
    }

    // === Send viewedObjectIDs event ===
    const results = search.renderState?.product_index?.infiniteHits?.results;
    const hits = results?.hits || [];
    
    if (hits.length > 0 && window.aa) {
      aa('viewedObjectIDs', {
        eventName: 'Hits Viewed',
        index: search.helper.state.sortBy || 'product_index',
        objectIDs: hits.map(hit => hit.objectID)
      });
    }
  });

  // === Accessibility patch ===
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new MutationObserver(() => {
      const lm = document.querySelector('.ais-InfiniteHits-loadMore');
      if (lm && !lm.hasAttribute('type')) lm.setAttribute('type', 'button');
      
      document
        .querySelectorAll('.ais-RefinementList-showMore')
        .forEach(btn => {
          if (!btn.hasAttribute('type')) btn.setAttribute('type', 'button');
          if (!btn.dataset.blurAttached) {
            btn.addEventListener('click', () => btn.blur());
            btn.dataset.blurAttached = 'true';
          }
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
