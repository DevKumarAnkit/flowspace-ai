"use client";

import Link from "next/link";
import { PricingTable, useUser } from "@clerk/nextjs";
import { ArrowLeft, ArrowRight, ShieldCheck, Sparkles } from "lucide-react";

export default function CheckoutPage() {
  const { isSignedIn } = useUser();

  return (
    <main className="min-h-screen bg-[#f8f8fc] px-5 py-10 text-[#272637] sm:grid sm:place-items-center">
      <section className="mx-auto w-full max-w-3xl rounded-3xl border border-[#e6e3f1] bg-white p-7 shadow-[0_24px_70px_rgba(60,48,99,0.12)] sm:p-9">
        <Link href="/#pricing" className="inline-flex items-center gap-2 text-sm font-semibold text-[#6a54d9] hover:text-[#5540bf]"><ArrowLeft size={16} /> Back to pricing</Link>
        <div className="mt-8 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#9a80fa] to-[#5d47d8] text-white shadow-lg shadow-[#7057e840]"><Sparkles size={22} /></div>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.14em] text-[#7057e8]">Flowspace Pro</p>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">Upgrade your flow.</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#716c80]">Choose Pro for $2 per month. Secure payment and plan management are provided by Clerk.</p>
        {isSignedIn ? <><div className="mt-7"><PricingTable for="user" /></div><Link href="/dashboard" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#836bf2] to-[#6048d8] text-sm font-bold text-white shadow-lg shadow-[#7057e840] transition hover:-translate-y-0.5">Continue to dashboard <ArrowRight size={17} /></Link></> : <><div className="mt-7 rounded-2xl border border-[#e4defa] bg-[#f8f6ff] p-5 text-sm leading-6 text-[#625c6e]"><strong className="block text-[#322c45]">Sign in to continue with payment.</strong><span className="mt-1 block">Your account keeps your subscription and Pro features connected to your Flowspace workspace.</span></div><Link href="/sign-in?next=/checkout" className="mt-6 flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#836bf2] to-[#6048d8] text-sm font-bold text-white shadow-lg shadow-[#7057e840] transition hover:-translate-y-0.5">Sign in to continue <ArrowRight size={17} /></Link></>}
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-[#8a8495]"><ShieldCheck size={14} /> Your payment details are handled securely by Clerk.</p>
      </section>
    </main>
  );
}
