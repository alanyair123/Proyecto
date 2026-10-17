export default function NotFoundPage() {
  return (
    <main style={{
      minHeight: "100vh",
      display: "grid",
      placeContent: "center",
      gap: "0.75rem",
      padding: "2rem",
      textAlign: "center",
      fontFamily: "system-ui, sans-serif",
    }}>
      <h1 style={{ margin: 0 }}>Página no encontrada</h1>
      <p style={{ margin: 0 }}>La página que buscas no existe.</p>
      <a href="/">Volver al inicio</a>
    </main>
  );
}
