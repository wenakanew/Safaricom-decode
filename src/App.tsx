import React from "react";

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4f46e5', color: 'white', padding: '2.5rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 'bold', marginBottom: '1rem' }}>FinAI Assistant</h1>
      <p style={{ fontSize: '1.25rem', opacity: 0.9 }}>If you can see this, the app is rendering correctly.</p>
      <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '0.75rem', backdropFilter: 'blur(4px)' }}>
        <p style={{ fontFamily: 'monospace' }}>Debug: App.tsx is clean and simplified</p>
      </div>
    </div>
  );
}
