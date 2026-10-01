import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from '@/contexts/AuthProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ToastProvider } from '@/contexts/ToastProvider';
import { OfflineSyncProvider } from '@/contexts/OfflineSyncProvider';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthProvider>
        <ToastProvider>
          <OfflineSyncProvider>
            <App />
          </OfflineSyncProvider>
        </ToastProvider>
      </AuthProvider>
    </I18nProvider>
  </StrictMode>
);
