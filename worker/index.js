export default {
  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/nox-proxy\/([^/]+)(\/.*)/);

    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const [, ip, path] = match;
    const target = `http://${ip}:15002${path}`;

    const headers = new Headers(request.headers);
    headers.set("host", `${ip}:15002`);
    headers.delete("origin");
    headers.delete("referer");

    const proxyRequest = new Request(target, {
      method: request.method,
      headers,
      body: request.body,
    });

    const response = await fetch(proxyRequest);

    const proxyResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });

    proxyResponse.headers.set("Access-Control-Allow-Origin", "*");
    proxyResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    proxyResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Accept");

    return proxyResponse;
  },
};
