"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A YouTube or Vimeo player that loads only when asked: those services set their
 * own cookies, so the learner chooses before any request is made to them. */
export function ExternalVideo({ src, title, provider }: { src: string; title: string; provider: "youtube" | "vimeo" }) {
  const [loaded, setLoaded] = useState(false);
  const name = provider === "youtube" ? "YouTube" : "Vimeo";
  if (loaded) {
    return <iframe src={src} title={title} className="h-full w-full" allow="encrypted-media; picture-in-picture; fullscreen; autoplay" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />;
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6 text-center text-white">
      <p className="text-sm">This video is hosted by {name}, which may set cookies and record that you watched it.</p>
      <Button type="button" onClick={() => setLoaded(true)}>Load video from {name}</Button>
      <a className="text-[13px] underline" href="/privacy">About cookies on the Hub</a>
    </div>
  );
}
