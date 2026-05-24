export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "radial-gradient(ellipse at 60% 40%, #1a0040 0%, #0d001a 55%, #000 100%)",
      }}
    >
      {children}
    </div>
  );
}
