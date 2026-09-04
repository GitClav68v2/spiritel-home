// Market ticker proxy — Yahoo Finance chart API (no key; unofficial but
// long-stable). Edge-cached 10 minutes: API usage is capped by the clock,
// not traffic (idle site = zero upstream calls). If quotes are unreachable
// the client quietly runs clocks-only, so a source change never breaks the
// page — it just sheds the prices until we swap sources.
const SYMBOLS = { dow: '%5EDJI', gold: 'GC=F', oil: 'CL=F', btc: 'BTC-USD' };

async function quote(symbol) {
  const res = await fetch(
    'https://query1.finance.yahoo.com/v8/finance/chart/' + symbol + '?range=1d&interval=1d',
    { headers: { 'User-Agent': 'Mozilla/5.0 (SpiritelTicker)' } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
  return typeof price === 'number' ? price : null;
}

export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request('https://spiritel.net/__ticker-cache-v3');
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    const [dow, gold, oil, btc] = await Promise.all([
      quote(SYMBOLS.dow), quote(SYMBOLS.gold), quote(SYMBOLS.oil), quote(SYMBOLS.btc)
    ]);
    if (dow === null && gold === null && oil === null && btc === null) throw new Error('no quotes');

    const out = { asOf: new Date().toISOString() };
    if (dow !== null) out.dow = dow;
    if (gold !== null) out.gold = gold;
    if (oil !== null) out.oil = oil;
    if (btc !== null) out.btc = btc;

    const response = new Response(JSON.stringify(out), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
        'Access-Control-Allow-Origin': 'https://spiritel.net'
      }
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    return new Response(JSON.stringify({ error: 'unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}
