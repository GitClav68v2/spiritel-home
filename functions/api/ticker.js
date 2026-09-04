// Market ticker proxy — Stooq free CSV quotes (delayed, no API key).
// Cached at the edge for 10 minutes: API usage is capped by the clock, not
// by traffic (idle site = zero upstream calls). If Stooq is unreachable and
// nothing is cached, the client quietly shows clocks only.
export async function onRequest(context) {
  const cache = caches.default;
  const cacheKey = new Request('https://spiritel.net/__ticker-cache-v1');
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  try {
    // ^DJI = Dow Jones Industrial Average, XAUUSD = gold spot, CL.F = WTI crude
    const res = await fetch(
      'https://stooq.com/q/l/?s=%5Edji,xauusd,cl.f&f=sd2t2c&h&e=csv',
      { headers: { 'User-Agent': 'SpiritelTicker/1.0' } }
    );
    if (!res.ok) throw new Error('upstream ' + res.status);
    const csv = await res.text();

    const out = {};
    for (const line of csv.trim().split('\n').slice(1)) {
      const [symbol, date, time, close] = line.split(',');
      const price = parseFloat(close);
      if (!isFinite(price)) continue;
      if (symbol === '^DJI') out.dow = price;
      else if (symbol === 'XAUUSD') out.gold = price;
      else if (symbol === 'CL.F') out.oil = price;
      out.asOf = date + ' ' + time;
    }
    if (out.dow === undefined && out.gold === undefined && out.oil === undefined) {
      throw new Error('no parseable quotes');
    }

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
