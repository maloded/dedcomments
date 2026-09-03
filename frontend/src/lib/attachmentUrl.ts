/**
 * Attachment `url`s come back from the backend as a root-relative path
 * (`/uploads/<id>.png` — see backend `AttachmentStorageService`), served by the
 * *backend*, not this app. Resolve it against the backend's own origin (derived
 * from `NEXT_PUBLIC_GRAPHQL_URL`) rather than the frontend's, or it'd 404 against
 * Next.js's own dev/prod server instead.
 */
export function resolveAttachmentUrl(url: string): string {
  const graphqlUrl = process.env.NEXT_PUBLIC_GRAPHQL_URL;
  if (!graphqlUrl) {
    return url;
  }
  return new URL(url, graphqlUrl).toString();
}
