export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const target = url.searchParams.get('url');

      if (!target) {
        return new Response('Missing ?url= parameter', { status: 400 });
      }

      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) {
        return new Response(`Fetch failed: ${res.status}`, { status: res.status });
      }

      const body = await res.text();
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': 'application/rss+xml; charset=utf-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    } catch (err) {
      return new Response('Error fetching target: ' + err.message, { status: 500 });
    }
  }
};
