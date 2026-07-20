"use client";

import { AlertCircle, RefreshCcw } from "lucide-react";

export default function SpacesError({ reset }: { reset: () => void }) {
  return <div className="spaces-route-error"><span><AlertCircle size={25} /></span><h2>We couldn’t load your spaces</h2><p>Your content is safe. Try loading this view again.</p><button onClick={reset}><RefreshCcw size={14} /> Try again</button></div>;
}
