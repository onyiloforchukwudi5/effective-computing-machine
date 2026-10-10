import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import AppNav from "@/components/AppNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <AppNav email={user.email} />
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
      </main>
    </>
  );
}
