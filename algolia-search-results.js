
/* 1 — grab the query string (?q=blue%20rug) */
const params        = new URLSearchParams(window.location.search);
const initialQuery  = params.get('q') || '';

const { liteClient: algoliasearch } = window['algoliasearch/lite'];
const searchClient = algoliasearch('6Z7PXO4P9V', 'cf6feac06fa1069b5dd3ed1b02b7fbcf');


const search = instantsearch({
  indexName: 'product_index',
  searchClient,
  routing: true,
  //insights: true, 

  /* Keep the first query in sync */
  initialUiState: {
    product_index: { query: initialQuery }
  }
});

const { infiniteHits } = instantsearch.widgets;
const { createInfiniteHitsSessionStorageCache } = instantsearch;
const sessionStorageCache = createInfiniteHitsSessionStorageCache();

const rugPadsExclude = 'NOT categories.name:"Rug Pads"';
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
  if (!text) return '';
  return text.length > maxLength
    ? text.substring(0, maxLength).trim() + '…'
  : text;
}

let showChildPrices = false;

search.addWidgets([
  instantsearch.widgets.searchBox({
    container: '#searchbox',
    placeholder: 'Find the perfect rug',
    autofocus: true,	 
    showSubmit: false,  
    searchAsYouType: true,
    queryHook(query, search) {
      const normalized = query.trim().toLowerCase();
      console.log(`Normalized query: "${normalized}"`);

      if (['rug pad', 'rug pads', 'jade pad', 'msm', 'cushion grip', 'magic stop', 'anchor pad', 'deluxe pad', 'non slip pad', 'non-slip pads'].includes(normalized))  {
        window.location.href = '/rugstudio-rug-pads.html';
      } else {
        search(query); // proceed with regular search
      }
    }
  }),

  instantsearch.widgets.stats({
    container: '#stats', 
    templates: {
      text(data, { html }) {
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
  }),

  instantsearch.widgets.currentRefinements({
    container: '#current-refinements',

    /* show ONLY the facets you expose elsewhere */
    includedAttributes: [
      'manufacturer',
      'attributes.Styles',
      'attributes.Size',
      'attributes.PriceGroup',
      'attributes.MaterialCategory',
      'attributes.Colors',
      'attributes.Weave',
      'attributes.Promotion'
    ],

    /* optional: rename long attribute paths for nicer labels */
    transformItems(items) {
      return items.map(item => ({
        ...item,
        label: item.label                 // “attributes.Size” → “Size”
        .replace(/^manufacturer$/, 'Brand')
        .replace(/^attributes\./, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
      }));
    },

    /* optional: tweak the pill template */
    templates: {
      item({ label, refinements, refine }, { html }) {
        return html`
<span class="refinement-label">${label}</span>
${refinements.map(refinement => html`
<span class="refinement-pill">
${refinement.label}
<button
type="button"
aria-label="Remove ${refinement.label}"
onClick=${() => refine(refinement)}
>✕</button>
</span>
`)}
`;
      }
    }
  }),


  instantsearch.widgets.sortBy({ 
    container: '#sort-by', 
    items: [ {
      value: 'product_index', 
      label: 'Relevance'
    }, 
            { value: 'product_index_price_asc', label: 'Price (low → high)' }, 
            { value: 'product_index_price_desc', label: 'Price (high → low)' }
           ]
  }),    



  instantsearch.widgets.infiniteHits({
    container: '#infinite-hits',
    templates: {
      item(hit, { html, components, sendEvent }) {
        const resizedImage = hit.image

        //? hit.image.replace('f_auto%2Cq_auto', 'f_auto%2Cq_auto%2Cw_250')
        ? hit.image
        .replace('f_auto%2Cq_auto', 'if_tar_gt_1.5/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:15/if_else/c_mfit%2Cf_auto%2Cq_auto%2Cw_170%2Ce_trim:1/if_end')
        .replace('/s_', '/l_')
        : null;
        const isParent = hit.custom_flag1 === 1;
        const titleText = cleanTitle(hit.title);
        const displayTitle = isParent ? truncateText(titleText, 40) : titleText;
        return html`
<div class="hit-card" onClick=${() => {
          if (hit.__queryID) {
            localStorage.setItem(
              `alg_ctx_${hit.objectID}`,
              JSON.stringify({ qid: hit.__queryID, pos: hit.__position })
            );
            sendEvent('click', hit, 'Product Clicked');
          }
        }}>
<a class="hit-link" href="${hit.url}" rel="noopener">
${resizedImage ? html`<img class="hit-img" src="${resizedImage}" alt="${hit.title}" width="250" />` : ''}
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
      },
    },
    cache: sessionStorageCache,
    loadMore: '<button type="button" class="ais-InfiniteHits-loadMore">Show more results</button>',
  }),

  instantsearch.widgets.clearRefinements({
    container: '#clear-refinements',
  }),

  instantsearch.widgets.refinementList({
    container: '#brand-list',
    attribute: 'manufacturer',
    showMore: true,
    limit: 5,
    //showMoreLimit: 20, // or however many you want to allow 
    templates: {
      showMoreText: ({ isShowingMore }) =>
      isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
    }
  }),
  instantsearch.widgets.refinementList({
    container: '#style-list',
    attribute: 'attributes.Styles',
    showMore: true,
    limit: 5,
    showMoreLimit: 20, // or however many you want to allow
    templates: {
      showMoreText: ({ isShowingMore }) =>
      isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
    }
  }),  
  instantsearch.widgets.refinementList({
    container: '#promotion-list',
    attribute: 'attributes.Promotion',
    showMore: false,
    limit: 3,
    //showMoreLimit: 20, // or however many you want to allow
    //templates: {
    //showMoreText: ({ isShowingMore }) =>
    //isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
    //}
  }),  
  instantsearch.widgets.refinementList({
    container: '#size-list',
    attribute: 'attributes.Size',
    showMore: true,
    limit: 5,
    showMoreLimit: 32, // or however many you want to allow
    transformItems(items, { results }) {
      // 1 — collect filters that came from Rules
      const autoFacetFilters =
            results?.explain?.params?.rules?.facetFilters || [];

      // 2 — clone every item and force-refine when needed
      return items.map((item) => {
      const key = `attributes.Size:${item.value}`;
return {
...item,                                   // ← spread (no asterisks)
isRefined: item.isRefined || autoFacetFilters.includes(key)
};
});
},
templates: {
showMoreText: ({ isShowingMore }) =>
isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}),  

instantsearch.widgets.refinementList({
container: '#price-list',
attribute: 'attributes.PriceGroup',    
}),   

instantsearch.widgets.refinementList({
container: '#material-list',
attribute: 'attributes.MaterialCategory',
showMore: true,
limit: 4,
showMoreLimit: 20, // or however many you want to allow
templates: {
showMoreText: ({ isShowingMore }) =>
isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}),    

instantsearch.widgets.refinementList({
container: '#color-list',
attribute: 'attributes.Colors',
showMore: true,
limit: 5,
showMoreLimit: 20, // or however many you want to allow
templates: {
showMoreText: ({ isShowingMore }) =>
isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}),

instantsearch.widgets.refinementList({
container: '#weave-list',
attribute: 'attributes.Weave',
showMore: true,
limit: 5,
showMoreLimit: 20, // or however many you want to allow

templates: {
showMoreText: ({ isShowingMore }) =>
isShowingMore ? '<span class="facetshowless"></span>Show Less' : '<span class="facetshowmore"></span>Show more'
}
}),


instantsearch.widgets.configure({
hitsPerPage: 16,
filters: 'custom_flag1 = 1 AND hide = 0 AND NOT categories.name:"Rug Pads"',
//query: initialQuery,
clickAnalytics: true,
getRankingInfo: true,
explain: ['*'] // <-- tells Algolia to include rule info
}),	
]);
search.start();




search.on('render', () => {
const q = (search.helper.state.query || '').trim();
const isChildSku = /^\d+x\d+$/i.test(q);   // 262081x1, 262081X2 …

const sizeRefinements = search.helper.getRefinements('attributes.Size');
const autoSizeFromRule =
search.renderState?.product_index?.results?.explain
?.params?.rules?.facetFilters
?.some(f => f.startsWith('attributes.Size:')) || false;

// update the existing flag (DON’T redeclare)
showChildPrices = sizeRefinements.length > 0 || autoSizeFromRule || isChildSku;

const baseFilters  = ['hide = 0'];
const parentFilter = 'custom_flag1 = 1';
const childFilter  = 'custom_flag1 = 0';

const desiredFilter   = showChildPrices ? childFilter : parentFilter;

const newFilterString = [...baseFilters, desiredFilter,rugPadsExclude].join(' AND ');

if (search.helper.state.filters !== newFilterString) {
search.helper.setQueryParameter('filters', newFilterString).search();
}

const results = search.renderState?.product_index?.results;
const hits = results?.hits || [];
const queryID = hits[0]?.__queryID;
//const hits       = search.renderState.product_index.results.hits || [];
//const queryID    = hits[0]?.__queryID;           // only non‐empty queries will have one

if (queryID) {
aa('viewedObjectIDs', {
eventName: 'Hits Viewed',
index: 'product_index',
objectIDs: hits.map(hit => hit.objectID),
queryID: queryID,
userToken: localStorage.alg_user || 'anonymous'
});
}
});



document.addEventListener('DOMContentLoaded', () => {
const observer = new MutationObserver(() => {
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
});
});

// Start observing the body for dynamic widgets
observer.observe(document.body, { childList: true, subtree: true });
});

