"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="dashboard-error"><div><h1>We couldn’t load your dashboard</h1><p>Your workspace is safe. Try refreshing the overview.</p><button onClick={reset}>Try again</button></div></div>;
}
