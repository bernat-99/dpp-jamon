import { createBrowserRouter, Navigate, NavLink, Outlet } from 'react-router-dom';

import AuditPage from '../pages/AuditPage';
import ResultPage from '../pages/ResultPage';
import ScanPage from '../pages/ScanPage';

function RootLayout() {
  return (
    <div className="layout">
      <header style={{ marginBottom: '1.5rem' }}>
        <nav className="tabs">
          <NavLink to="/scan" className={({ isActive }) => (isActive ? 'active' : '')}>
            Escanear
          </NavLink>
          <NavLink to="/result" className={({ isActive }) => (isActive ? 'active' : '')}>
            Resultado
          </NavLink>
          <NavLink to="/audit" className={({ isActive }) => (isActive ? 'active' : '')}>
            Auditoría
          </NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/scan" replace /> },
      { path: '/scan', element: <ScanPage /> },
      { path: '/result', element: <ResultPage /> },
      { path: '/audit', element: <AuditPage /> },
      { path: '*', element: <Navigate to="/scan" replace /> },
    ],
  },
]);
