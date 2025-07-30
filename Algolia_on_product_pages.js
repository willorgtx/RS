
// add-to-cart-events.js
document.addEventListener('DOMContentLoaded', () => {
  // Watch every native "Add to cart" link
  document.querySelectorAll('a[href*="AddToCart.aspx"]').forEach(link => {
    link.addEventListener('click', () => {
      const url      = new URL(link.href, location.origin);
      const objectID = url.searchParams.get('ItemID');
      const quantity = Number(url.searchParams.get('Quantity') || 1);

      // Recover search context (if this product came from a search)
      let queryID, positions;
      try {
        const ctx = JSON.parse(localStorage.getItem(`alg_ctx_${objectID}`) || '{}');
        queryID   = ctx.qid;
        positions = ctx.pos !== undefined ? [ctx.pos] : undefined;
      } catch {}

      // Build the payload once
      const basePayload = {
        index:      'product_index',          // change if your index name differs
        eventName:  'Add to Cart',
        objectIDs:  [objectID],
        objectData: [{ quantity }],
        eventSubtype: 'addToCart'
      };

      if (queryID) {
        // The item was added straight after a search ➜ use the "...AfterSearch" variant
        aa('addedToCartObjectIDsAfterSearch', {
          ...basePayload,
          queryID,
          ...(positions && { positions })
        });
      } else {
        // The item was added from a non-search context (e.g. recommendation carousel)
        aa('addedToCartObjectIDs', basePayload);
      }
    });
  });
});

