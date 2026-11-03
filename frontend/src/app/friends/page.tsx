"use client";

import { useRouter } from "next/navigation";
import { FriendsCenter } from "@/components/social/SocialCenter";

export default function FriendsPage() {
  const router = useRouter();
  return <main className="min-h-dvh bg-[#080a08]"><FriendsCenter onClose={() => router.push("/play")} /></main>;
}
