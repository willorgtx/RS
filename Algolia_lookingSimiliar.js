//<script src="https://cdn.jsdelivr.net/npm/algoliasearch@4/dist/algoliasearch-lite.umd.js"></script>
//<script src="https://cdn.jsdelivr.net/npm/instantsearch.js@4"></script>

document.addEventListener('DOMContentLoaded', () => {
  /* ⭐ 1. Current product ID */
  const idMatch  = document.body.className.match(/ProductDetails-(\d+)/);
  if (!idMatch) return;
  const objectID = idMatch[1];

  /* ⭐ 2. Algolia client */
  const searchClient = algoliasearch(
    '6Z7PXO4P9V',                    // App ID
    'cf6feac06fa1069b5dd3ed1b02b7fbcf' // Search-only key
  );

  /* ⭐ 3. Tiny InstantSearch instance */
  const search = instantsearch({
    indexName:   'product_index',
    searchClient
  });

  /* ⭐ 4. Grab helpers from the UMD build */
  const { lookingSimilar }        = instantsearch.widgets;
  //const { carousel /*, html */ }  = instantsearch.templates;

  /* ⭐ 5. Mount the widget */
  search.addWidgets([
    lookingSimilar({
      container: '#recommend-container',
      objectIDs: ['##ITEMID##'],
      limit: 6,
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
            <a href="${hit.url}" class="block text-center">
              ${resizedImage
          ? html`<img class="hit-img rounded-lg shadow" src="${resizedImage}" alt="${hit.title}" />`
        : ''}
              <span class="mt-1 block text-sm truncate">${hit.title}</span>
            </a>`;
        },

        threshold: 75,
      }
    })
  ]);

  search.start();
});