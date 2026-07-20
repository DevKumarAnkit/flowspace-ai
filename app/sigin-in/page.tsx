import { redirect } from "next/navigation";

export default function MisspelledSignInPage() {
  redirect("/log-in");
}
