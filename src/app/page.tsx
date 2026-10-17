export default function HomePage() {
  return (
    <main className="home">
      <h1>PulseMarket</h1>
      <p>¡Prepárate para jugar!</p>
      <nav aria-label="Menú principal" className="menu">
        <a href="/play?mode=solo">Jugar solo</a>
        <a href="/lobby">Lobbies</a>
        <a href="/stats">Estadísticas</a>
      </nav>
      <style>{`
        .home { min-height: 100vh; display: grid; align-content: center; justify-items: center; gap: 1rem; padding: 2rem; font-family: system-ui, sans-serif; text-align: center; }
        h1 { margin: 0; font-size: clamp(2.5rem, 8vw, 5rem); }
        p { margin: 0; color: #555; }
        .menu { display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; margin-top: 1rem; }
        .menu a { border-radius: .75rem; background: #4338ca; color: white; padding: .85rem 1.2rem; text-decoration: none; }
        .menu a:hover { background: #3730a3; }
      `}</style>
    </main>
  );
}
