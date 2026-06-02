import type { IncomingMessage, ServerResponse } from "node:http";

export type HostedRouteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
) => Promise<boolean>;

type RoutesDeps = {
  handlers: HostedRouteHandler[];
  notFound: (response: ServerResponse) => void;
};

export function createRoutes(deps: RoutesDeps) {
  async function handle(request: IncomingMessage, response: ServerResponse, url: URL) {
    for (const handler of deps.handlers) {
      if (await handler(request, response, url)) {
        return true;
      }
    }

    deps.notFound(response);
    return false;
  }

  return {
    handle,
  };
}
