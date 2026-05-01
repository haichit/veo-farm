export function BackgroundEffects() {
  return (
    <div
      aria-hidden="true"
      className="bg-effects fixed inset-0 -z-10 overflow-hidden pointer-events-none"
    >
      <div
        className="orb absolute rounded-full blur-3xl opacity-15 animate-orb-float w-[500px] h-[500px] -top-52 -left-32"
        style={{ background: '#8a5cf6' }}
      />
      <div
        className="orb absolute rounded-full blur-3xl opacity-15 animate-orb-float w-[400px] h-[400px] -bottom-40 -right-32"
        style={{ background: '#ec4899', animationDelay: '-8s' }}
      />
      <div
        className="orb absolute rounded-full blur-3xl opacity-15 animate-orb-float w-[350px] h-[350px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ background: '#06b6d4', animationDelay: '-16s' }}
      />
    </div>
  );
}
