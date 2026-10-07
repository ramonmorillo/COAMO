import { createHashRouter, Navigate } from 'react-router-dom';

import { AppShell } from './components/layout/AppShell';
import { CentersPage } from './pages/CentersPage';
import { ClinicalAssessmentPage } from './pages/ClinicalAssessmentPage';
import { ConfirmEmailLinkPage } from './pages/ConfirmEmailLinkPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NewPatientPage } from './pages/NewPatientPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';
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
      { path: '/patients', element: <PatientsPage /> },
      { path: '/patients/new', element: <NewPatientPage /> },
      { path: '/patients/:id', element: <PatientDetailPage /> },
      { path: '/visits/:visitId/clinical', element: <ClinicalAssessmentPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/login" replace /> },
]);
