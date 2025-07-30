const { liteClient: algoliasearch } = window['algoliasearch/lite'];
const searchClient = algoliasearch(
  '6Z7PXO4P9V',
  'cf6feac06fa1069b5dd3ed1b02b7fbcf'
);

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

// 1. Read & parse the meta-keywords
const meta = document.querySelector('meta[name="keywords"]')?.content || '';
const keywords = meta
.split(',')
.map(s => s.trim())
.filter(Boolean);

// 2. Fallback helper: pull the last path segment as a query
function slugToQuery() {
const segments = window.location.pathname
.replace(/\/$/, '')
.split('/');
const slug = segments.pop() || '';
return slug.replace(/[-_]/g, ' ').trim();
}

(async function() {
const indexName    = 'product_index';
const primaryQuery = keywords.join(' ');
let useQuery       = primaryQuery;

// 3. Do a cheap 1-hit search on the meta-keywords
try {
const { results } = await searchClient.search([{
indexName,
      query: primaryQuery,
      hitsPerPage: 1,
        filters: 'custom_flag1 = 1 AND hide = 0'
}]);
const first = results[0];
if (first.nbHits === 0) {
  // Swap in the slug if no meta-keyword hits
  useQuery = slugToQuery();
}
} catch (err) {
  console.error('Meta-keywords fallback check failed', err);
}

// 4. Initialize InstantSearch with the chosen query
const search = instantsearch({
  indexName,
  searchClient,
  routing: true,
  insights: true
});

const {
  sortBy,
  infiniteHits,
  clearRefinements,
  refinementList,
  configure
} = instantsearch.widgets;

const sessionStorageCache =
      instantsearch.createInfiniteHitsSessionStorageCache();

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
        const isParent    = hit.custom_flag1 === 1;
        const titleText   = cleanTitle(hit.title);
        const displayTitle = isParent
        ? truncateText(titleText, 40)
        : titleText;
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
<a class="hit-link" href="${hit.url}" rel="noopener">
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
query: useQuery,
clickAnalytics: true,
getRankingInfo: true,
explain: ['*'],
removeWordsIfNoResults: 'allOptional',
hitsPerPage: 16,
filters: 'custom_flag1 = 1 AND hide = 0'
})
]);

search.start();

// — Child‐price toggle logic (unchanged) —
let showChildPrices = false;
search.on('render', () => {
const q            = (search.helper.state.query || '').trim();
const isChildSku   = /^\d+x\d+$/i.test(q);
const sizeRefs     = search.helper.getRefinements('attributes.Size');
const autoSizeRule = search.renderState
?.product_index
?.results
?.explain
?.params
?.rules
?.facetFilters
?.some(f => f.startsWith('attributes.Size:')) || false;
showChildPrices = sizeRefs.length > 0 || autoSizeRule || isChildSku;

const baseFilters    = ['hide = 0'];
const parentFilter   = 'custom_flag1 = 1';
const childFilter    = 'custom_flag1 = 0';
const desiredFilter  = showChildPrices ? childFilter : parentFilter;
const newFilterString = [...baseFilters, desiredFilter].join(' AND ');

if (search.helper.state.filters !== newFilterString) {
search.helper
.setQueryParameter('filters', newFilterString)
.search();
}
});

// — Accessibility patch for load more / show more buttons —
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
