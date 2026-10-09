"use client";
export default function LogoutButton() {
  return (
    <button className="sec" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}>
      Log out
    </button>
  );
}
