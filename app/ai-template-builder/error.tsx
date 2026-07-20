"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="template-route-error"><h2>Something went wrong</h2><p>We couldn’t load your generated apps.</p><button onClick={reset}>Try again</button></div>; }
