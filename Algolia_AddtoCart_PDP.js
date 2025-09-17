
//<script src="https://cdn.jsdelivr.net/npm/instantsearch.js@4"></script>
//<script src="https://cdn.jsdelivr.net/npm/@algolia/recommend"></script>



// add-to-cart-events.js
document.addEventListener('DOMContentLoaded', () => {
  const DEFAULT_INDEX = 'product_index';
  const params        = new URLSearchParams(location.search);
  const clickedID     = params.get('clickedID');     // EXACT object that was clicked on SRP (parent or child)
  const queryID       = params.get('queryID');       // query that produced that click
  const indexFromUrl  = params.get('index') || DEFAULT_INDEX;
  document.querySelectorAll('a[href*="AddToCart.aspx"]').forEach(link => {
    link.addEventListener('click', () => {
      const url       = new URL(link.href, location.origin);
      const childID   = url.searchParams.get('ItemID');                // the purchasable variant
      const quantity  = Number(url.searchParams.get('Quantity') || 1);
      const parentID  = link.getAttribute('data-parent-id');           // parent PDP id (always present per your note)

      // Helpful for your own analytics (optional)
      const priceAttr    = document.querySelector('[data-item-price]')?.getAttribute('data-item-price');
      const discountAttr = document.querySelector('[data-item-discount]')?.getAttribute('data-item-discount');
      const price        = Number(priceAttr);
      const discount     = Number(discountAttr);

      // Attribution target:
      // Prefer the exact object that was clicked; if absent, fall back to the parent PDP (good enough for parent-click cases).
      const attributionObjectID = clickedID || parentID;

      const basePayload = {
        index: indexFromUrl,
        eventName: 'Product Added To Cart',
        objectIDs: [attributionObjectID || childID], // last resort: childID
        objectData: [{
          quantity,
          // keep the true variant in metadata
          childObjectID: childID,
          ...(Number.isFinite(price)    && { price }),
          ...(Number.isFinite(discount) && { discount }),
        }],
        currency: 'USD'
      };

      if (queryID && attributionObjectID) {
        // Perfect attribution: same objectID that was clicked + the queryID that produced it
        aa('addedToCartObjectIDsAfterSearch', { ...basePayload, queryID });
      } else {
        // Safety net: Insights may still infer if the *same* objectID was clicked previously.
        aa('addedToCartObjectIDs', basePayload, { inferQueryID: true });
      }
    }, { passive: true });
  });

  // (Nice to have) track PDP view for personalization/analytics
  const pdpObjectID = new URLSearchParams(location.search).get('ItemID');
  if (pdpObjectID) {
    aa('viewedObjectIDs', {
      index: DEFAULT_INDEX,
      eventName: 'Product Viewed',
      objectIDs: [pdpObjectID]
    });
  }
});

