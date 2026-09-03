"use client";

import dynamic from "next/dynamic";

// ssr: false — see HomeView's own doc comment for why.
const HomeView = dynamic(() => import("@/components/HomeView").then((m) => m.HomeView), {
  ssr: false,
});

export default function Page() {
  return <HomeView />;
}
