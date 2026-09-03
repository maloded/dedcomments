/**
 * The backend's own origin (scheme + host + port), derived from
 * `NEXT_PUBLIC_GRAPHQL_URL` (which points at `/graphql` on that same origin).
 * Shared by anything that needs to reach the backend outside of Apollo's
 * `HttpLink` — attachment file URLs (`lib/attachmentUrl.ts`) and the
 * Socket.IO connection (`lib/socket.ts`), both served from the backend's HTTP
 * port, not this app's.
 */
export function getBackendOrigin(): string {
  const graphqlUrl = process.env.NEXT_PUBLIC_GRAPHQL_URL;
  if (!graphqlUrl) {
    return "";
  }
  return new URL(graphqlUrl).origin;
}
