import { SignIn } from "@clerk/nextjs";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const destination = next === "/checkout" ? "/auth/callback?next=/checkout" : "/auth/callback";
  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#09090b' }}>
      <SignIn forceRedirectUrl={destination} />
    </main>
  );
}
