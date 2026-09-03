"use client";

import { useState, type ReactNode } from "react";
import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "@/lib/apolloClient";

export function Providers({ children }: { children: ReactNode }) {
  // One client per mounted app, not per render — created lazily so it's never
  // constructed during SSR (this whole tree only ever mounts client-side, see
  // `HomeView`'s `dynamic(..., { ssr: false })`, but `useState`'s initializer
  // form is the correct way to guard a one-time construction regardless).
  const [client] = useState(() => createApolloClient());

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
