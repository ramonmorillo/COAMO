import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { CentersPage } from './pages/CentersPage';
import { ConfirmEmailLinkPage } from './pages/ConfirmEmailLinkPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { SetPasswordPage } from './pages/SetPasswordPage';

export const router = createHashRouter([
  { path: '/', element: <LoginPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/auth/confirm', element: <ConfirmEmailLinkPage /> },
  { path: '/set-password', element: <SetPasswordPage /> },
  {
    path: '/',
    element: <AppShell />,
    children: [
      { path: '/dashboard', element: <HomePage /> },
      { path: '/centers', element: <CentersPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
