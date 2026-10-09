import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LogoutButton from "@/components/LogoutButton";

const links: [string, string][] = [
  ["/dashboard", "Dashboard"], ["/mail", "Mail"], ["/contacts", "Contacts"], ["/accounts", "Mail accounts"],
  ["/senders", "SMTP senders"], ["/sync", "Sync"], ["/sequences", "Sequences"],
  ["/auto-responders", "Auto-responders"], ["/settings/ai", "AI settings"], ["/settings/profile", "Business profile"],
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  return (
    <>
      <nav>
        {links.map(([h, l]) => <a key={h} href={h}>{l}</a>)}
        <span style={{ flex: 1 }} />
        <span className="muted" style={{ color: "#aaa" }}>{user.email}</span>
        <LogoutButton />
      </nav>
      <main>{children}</main>
    </>
  );
}
