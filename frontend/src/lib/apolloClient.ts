import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

/**
 * Browser-only client, pointed at the backend's `/graphql` endpoint. This app
 * never fetches during SSR (see `HomeView` — it's dynamically imported with
 * `ssr: false`), so there's no need for a per-request client or a separate
 * server-side URL: `NEXT_PUBLIC_GRAPHQL_URL` is always resolved from the
 * browser, exactly like a curl/Postman request would reach the backend.
 */
export function createApolloClient(): ApolloClient {
  return new ApolloClient({
    link: new HttpLink({
      uri: process.env.NEXT_PUBLIC_GRAPHQL_URL,
    }),
    cache: new InMemoryCache(),
  });
}
