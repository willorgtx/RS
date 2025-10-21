//<script src="https://cdn.jsdelivr.net/npm/algoliasearch@4/dist/algoliasearch-lite.umd.js"></script>
//<script src="https://cdn.jsdelivr.net/npm/instantsearch.js@4"></script>
//<script src="https://cdn.jsdelivr.net/npm/search-insights@2"></script>

document.addEventListener('DOMContentLoaded', () => {
  // containers are hidden by default in your HTML:
  // <div class="container recently-viewed-container" style="display:none;"></div>
  // <div class="container" id="recommend-container" style="display:none;"></div>

  const rec = document.getElementById('recommend-container');
  const rv  = document.querySelector('.recently-viewed-container');
  const isProductPage = !!document.querySelector('h1.ProductDetailsProductName[itemprop="name"]');

  const showRecommend = () => {
    if (rv) rv.style.display = 'none';
    if (rec) rec.style.removeProperty('display');
  };
  const showRecentlyViewed = () => {
    if (rec) rec.style.display = 'none';
    if (rv) rv.style.removeProperty('display');
  };

  // guards: product page + libs + containers
  if (!isProductPage || !rec || !rv) return showRecentlyViewed();
  if (typeof algoliasearch === 'undefined' || typeof instantsearch === 'undefined') return showRecentlyViewed();


// Americommerce mergecode => becomes the real ID on the client
const seedId = '##ITEMID##';
if (!seedId || seedId.indexOf('#') !== -1) return showRecentlyViewed(); // mergecode didn't render

  const searchClient = algoliasearch('6Z7PXO4P9V','cf6feac06fa1069b5dd3ed1b02b7fbcf'); // Search-only key

  // Initialize Algolia Insights
  if (typeof window.aa === 'undefined' && typeof window.searchInsights !== 'undefined') {
    window.aa = window.searchInsights;
  }

  const search = instantsearch({
    indexName:   'product_index',
    searchClient
  });

  const { lookingSimilar } = instantsearch.widgets;

  let sawItems = false;
  search.addWidgets([
    lookingSimilar({
      container: '#recommend-container',
      objectIDs: ['##ITEMID##'],
      limit: 6,
      threshold: 55,
      queryParameters: { 
     	filters: "(\"custom_flag1\":\"True\") AND (NOT \"attributes.Collection\":\"RugStudio-Sample-Sale\") AND (NOT \"attributes.Collection\":\"Rugstudio-Sample-\") AND (NOT \"attributes.Collection\":\"RugStudio-Sample-Promotion\")"
      },
            
      templates: {
        /* how each card looks */
        item(hit, { html }) {
          const resizedImage = hit.image
        ? hit.image
        .replace('f_auto%2Cq_auto', 'if_tar_gt_1.5/c_mfit%2Cf_auto%2Cq_auto%2Cw_270%2Ce_trim:15/if_else/c_mfit%2Cf_auto%2Cq_auto%2Cw_270%2Ce_trim:1/if_end')
        .replace('/s_', '/l_')
        : null;
          return html`
            <a href="${hit.url}" class="block text-center recommendation-link" data-object-id="${hit.objectID}" data-product-name="${hit.name || hit.title}" data-source-id="${seedId}">
              ${resizedImage
          ? html`<img class="hit-img rounded-lg shadow" src="${resizedImage}" alt="${hit.title}" />`
        : ''}
              <span class="mt-1 block text-sm truncate">${hit.title}</span>
            </a>`;
        }
      },
      // decide visibility based on hits
      transformItems(items) {
        if (Array.isArray(items) && items.length > 0) {
          sawItems = true;
          showRecommend();
        } else {
          showRecentlyViewed();
        }
        return items;
      }
    })
  ]);

  // extra safety: if render happens with no items, show RV
  search.on('render', () => {
    if (!sawItems) showRecentlyViewed();
  });
  search.on('error', () => showRecentlyViewed());

  // Click tracking function for recommendation analytics
  window.trackRecommendationClick = function(event, objectID, productName, sourceProductID, widgetType) {
    // Find the link element that was clicked
    const linkElement = event.target.closest('.recommendation-link');
    if (!linkElement) return;

    // Prevent default navigation temporarily for tracking
    event.preventDefault();

    // Custom analytics tracking (Google Analytics, Adobe Analytics, etc.)
    if (typeof gtag !== 'undefined') {
      // Google Analytics 4
      gtag('event', 'select_item', {
        item_list_id: widgetType,
        item_list_name: 'Similar Products',
        items: [{
          item_id: objectID,
          item_name: productName,
          index: 1
        }]
      });
    }

    if (typeof analytics !== 'undefined' && analytics.track) {
      // Segment/Analytics.js
      analytics.track('Product Clicked', {
        objectID: objectID,
        productName: productName,
        sourceProductID: sourceProductID,
        widgetType: widgetType,
        recommendationType: 'lookingSimilar'
      });
    }

    // Algolia Insights (if using Algolia's built-in analytics)
    if (typeof aa !== 'undefined' && typeof aa === 'function') {
      aa('clickedObjectIDs', {
        index: 'product_index',
        eventName: 'Looking Similar - Click',
        objectIDs: [objectID]
        // Note: positions and queryID not needed for recommendation clicks
      });
    }

    // Custom data layer for any analytics platform
    if (typeof dataLayer !== 'undefined') {
      dataLayer.push({
        event: 'recommendation_click',
        recommendation_type: 'similar_products',
        clicked_product_id: objectID,
        clicked_product_name: productName,
        source_product_id: sourceProductID,
        widget_type: widgetType
      });
    }

    // Navigate to the product URL after tracking
    setTimeout(() => {
      window.location.href = linkElement.href;
    }, 100);
  };

  search.start();

  // Add click tracking via event delegation after widget renders
  setTimeout(() => {
    const container = document.getElementById('recommend-container');
    if (container) {
      container.addEventListener('click', function(e) {
        const link = e.target.closest('.recommendation-link');
        if (link) {
          const objectID = link.dataset.objectId;
          const productName = link.dataset.productName;
          const sourceID = link.dataset.sourceId;

          // Track the click
          trackRecommendationClick(e, objectID, productName, sourceID, 'similar-products');
        }
      });
    }
  }, 100);
});