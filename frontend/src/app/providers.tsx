"use client";

import { useState, type ReactNode } from "react";
import { ApolloProvider } from "@apollo/client/react";
import { createApolloClient } from "@/lib/apolloClient";
import { ConnectionStatusProvider } from "@/lib/connectionStatus";
import { ModeratorAuthProvider } from "@/lib/moderatorAuth";
import { ToastProvider } from "@/lib/toast";
import { RealtimeConnection } from "@/components/RealtimeConnection";
import { Toast } from "@/components/Toast";

export function Providers({ children }: { children: ReactNode }) {
  // One client per mounted app, not per render — created lazily so it's never
  // constructed during SSR (this whole tree only ever mounts client-side, see
  // `HomeView`'s `dynamic(..., { ssr: false })`, but `useState`'s initializer
  // form is the correct way to guard a one-time construction regardless).
  const [client] = useState(() => createApolloClient());

  return (
    <ApolloProvider client={client}>
      <ConnectionStatusProvider>
        <ModeratorAuthProvider>
          <ToastProvider>
            {/* Headless — owns the Socket.IO connection, needs Apollo Client
                (to refetch on commentCreated/commentHidden) and the status
                setter, both from context above it, so it has to live inside
                both providers. Also shows a toast on authorBanned. */}
            <RealtimeConnection />
            {children}
            <Toast />
          </ToastProvider>
        </ModeratorAuthProvider>
      </ConnectionStatusProvider>
    </ApolloProvider>
  );
}
