//<!-- Algolia v5 UMD -->
//<script defer="" src="https://cdn.jsdelivr.net/npm/algoliasearch@5/dist/algoliasearch.umd.js"></script>
//<!-- Algolia Insights (aa) -->
//<script defer="" src="https://cdn.jsdelivr.net/npm/search-insights@2/dist/search-insights.min.js"></script>


window.addEventListener('DOMContentLoaded', async () => {
  const APP_ID   = '6Z7PXO4P9V';
  const API_KEY  = 'cf6feac06fa1069b5dd3ed1b02b7fbcf'; // search-only
  const INDEX    = 'product_index';
  const SKU_ATTR = 'sku';

  aa('init', { appId: APP_ID, apiKey: API_KEY });

  const root = window.algoliasearch;
  const makeClient = (typeof root === 'function') ? root : (root && root.algoliasearch);
  if (!makeClient) { console.error('Algolia v5 UMD not found on window.'); return; }
  const client = makeClient(APP_ID, API_KEY); // v5: no .initSearch()

  // ---- Extract order lines (skip blank SKUs) ----------------------
  const rows = [...document.querySelectorAll('.ViewOrderItem, .ViewOrderItemAlt')];
  if (!rows.length) return;

  const lookups = rows.map(r =>
    (r.querySelector('.OrderDetailsItemNr')?.textContent.trim() || '')
      .replace(/\s*\[.*?\]/, '')
      .replace(/\s+/g, '')
  );

  // ---- v5 requests: params are TOP-LEVEL (not nested under `params`) ----
  const requests = lookups.flatMap(sku => {
    if (!sku) return []; // skip empties
    const escaped = sku.replace(/"/g, '\\"');
    return [
      {
        indexName: INDEX,
        query: '',                // filter-only search
        hitsPerPage: 1,
        filters: `${SKU_ATTR}:"${escaped}"`
      },
      {
        indexName: INDEX,
        query: sku,               // fallback keyword
        hitsPerPage: 1,
        restrictSearchableAttributes: [SKU_ATTR]
      }
    ];
  });

  if (!requests.length) return;

  let results;
  try {
    ({ results } = await client.search({ requests }));
  } catch (e) {
    console.error('Algolia search failed', e);
    return;
  }

  // ---- Build Insights payload ------------------------------------
  const items = [];

  rows.forEach((row, iRow) => {
    const sku = lookups[iRow];
    if (!sku) return;

    // each row produced 2 requests
    const hitIdx = items.length * 2;
    const hit = results?.[hitIdx]?.hits?.[0] || results?.[hitIdx + 1]?.hits?.[0];
    const objectID = (hit && hit.objectID) || sku;

    const qty  = parseInt(row.querySelector('.OrderDetailsItemQuantity')?.textContent.trim() || '1', 10) || 1;
    const priceTxt = row.querySelector('.OrderDetailsItemPrice')?.textContent.trim() || '$0';
    const price = Number(priceTxt.replace(/[^0-9.]/g, '')) || 0;

    let queryID, position;
    try {
      const ctx = JSON.parse(localStorage.getItem(`alg_ctx_${objectID}`) || '{}');
      queryID = ctx.qid;
      position = ctx.pos;
    } catch {}

    items.push({
      objectID,
      price,
      quantity: qty,
      queryID,
      position
    });

    localStorage.removeItem(`alg_ctx_${objectID}`);
  });

  if (!items.length) return;

  const eventName = 'Order Placed';
  const currency = 'USD';

  const calcValue = group => group.reduce((sum, i) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0);
  const buildObjectData = group => group.map(({ price, quantity, position }) => ({
    price,
    quantity,
    ...(position !== undefined && { position })
  }));

  const groupedByQuery = items.reduce((acc, item) => {
    if (item.queryID) {
      (acc[item.queryID] ||= []).push(item);
    }
    return acc;
  }, {});

  Object.entries(groupedByQuery).forEach(([queryID, group]) => {
    const value = Number(calcValue(group).toFixed(2));
    aa('purchasedObjectIDsAfterSearch', {
      eventName,
      index: INDEX,
      queryID,
      objectIDs: group.map(i => i.objectID),
      objectData: buildObjectData(group),
      currency,
      value
    });
  });

  const withoutQuery = items.filter(i => !i.queryID);
  if (withoutQuery.length) {
    const value = Number(calcValue(withoutQuery).toFixed(2));
    aa('purchasedObjectIDs', {
      eventName,
      index: INDEX,
      objectIDs: withoutQuery.map(i => i.objectID),
      objectData: buildObjectData(withoutQuery),
      currency,
      value,
      inferQueryID: true
    });
  }
});

