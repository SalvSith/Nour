import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const App = lazy(() => import('./App'));
const CuriousPage = lazy(() => import('./CuriousPage'));

const isCurious = window.location.pathname === '/curious';

if (!isCurious) {
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) e.preventDefault();
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (
      (e.ctrlKey || e.metaKey) &&
      ['+', '-', '=', '0'].includes(e.key)
    ) e.preventDefault();
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      {isCurious ? <CuriousPage /> : <App />}
    </Suspense>
  </StrictMode>
);
