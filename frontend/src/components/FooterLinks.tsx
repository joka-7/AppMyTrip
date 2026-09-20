export function FooterLinks() {
  return (
    <div className="fixed bottom-2 right-2 z-40 flex items-center gap-2 text-lg">
      <a
        href="https://github.com/joka-7"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        className="opacity-60 hover:opacity-100 transition-opacity"
      >
        🐙
      </a>
      <a
        href="https://jk-dev-7.vercel.app"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="jk.dev portfolio"
        className="opacity-60 hover:opacity-100 transition-opacity"
      >
        🌐
      </a>
    </div>
  );
}
