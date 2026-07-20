import { SignIn } from "@clerk/nextjs";

export default function LogInPage() {
  return (
    <main style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", backgroundColor: "#09090b" }}>
      <SignIn forceRedirectUrl="/auth/callback" />
    </main>
  );
}
