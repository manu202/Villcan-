// Pass-through layout for public, unauthenticated routes (e.g. /tienda/[slug]).
// Deliberately does NOT mount BranchProvider/SettingsProvider/AuthGuard/
// HamburgerMenu — those are authenticated-session concerns that belong to
// (app)/layout.tsx only. See design "AuthGuard — el fix".
export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
