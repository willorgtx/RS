(async () => {
    const APP_ID  = '6Z7PXO4P9V';
    const API_KEY = 'cf6feac06fa1069b5dd3ed1b02b7fbcf';
    const INDEX   = 'product_index';
    const SKU_ATTR = 'sku';               // ← replace with the real key
  
    const { default: algoliasearch } =
      await import('https://cdn.jsdelivr.net/npm/algoliasearch@4.22.0/dist/algoliasearch-lite.esm.browser.js');
  
    const client  = algoliasearch(APP_ID, API_KEY);
    const rows    = [...document.querySelectorAll('.ViewOrderItem, .ViewOrderItemAlt')];
  
    const lookups = rows.map(r =>
      (r.querySelector('.OrderDetailsItemNr')?.textContent.trim() || '')
        .replace(/\s*\[.*?\]/, '').replace(/\s+/g, '')
    );
  
    /* ---- build multipleQueries: try exact filter first, fall back to keyword ---- */
    const queries = lookups.flatMap(sku => ([
      {   // #1 exact filter on SKU_ATTR
        indexName: INDEX,
        params: { hitsPerPage: 1, filters: `${SKU_ATTR}:"${sku.replace(/"/g, '\\"')}"` }
      },
      {   // #2 keyword search restricted to that attribute
        indexName: INDEX,
        params: {
          hitsPerPage: 1,
          query: sku,
          restrictSearchableAttributes: [SKU_ATTR]
        }
      }
    ]));
  
    const { results } = await client.multipleQueries(queries);
  
    /* ---- resolve each sku to objectID ---- */
    const objectIDs  = [];
    const objectData = [];
  
    rows.forEach((row, i) => {
      /* each SKU had two queries (filter, search) -> pick first hit found */
      const hitIdx   = i * 2;
      const hit      = results[hitIdx]?.hits?.[0] || results[hitIdx + 1]?.hits?.[0];
  
      const objectID = hit?.objectID ?? lookups[i];   // fallback = SKU
      const priceTxt = row.querySelector('.OrderDetailsItemPrice')?.textContent.trim() || '$0';
      const price    = priceTxt.replace(/[^0-9.]/g, '');
      const qty      = parseInt(row.querySelector('.OrderDetailsItemQuantity')?.textContent.trim() || '1', 10);
  
      let queryID, position;
      try {
        const ctx = JSON.parse(localStorage.getItem(`alg_ctx_${objectID}`) || '{}');
        queryID   = ctx.qid;
        position  = ctx.pos;
      } catch {}
  
      objectIDs.push(objectID);
      objectData.push({
        price,
        quantity: qty,
        ...(queryID && { queryID }),
        ...(position !== undefined && { position })
      });
    });
  
    console.table({ lookups, objectIDs });  // <- quickly check mapping
  
    const payload = {
      eventName:  'Order Placed',
      index:      INDEX,
      objectIDs,
      objectData,
      currency:   'USD',
      eventSubtype: 'purchase'
    };
  
    const method = objectData.some(i => i.queryID)
      ? 'purchasedObjectIDsAfterSearch'
      : 'purchasedObjectIDs';
  
      aa(method, payload);
      console.log('Would call', method, 'with →', payload);
  })();
  