/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { GameProvider } from './contexts/GameContext';
import { GrandNotificationProvider } from './components/GrandNotification';
import Home from './pages/Home';
import Setup from './pages/Setup';
import Chat from './pages/Chat';
import { ErrorBoundary } from './components/ErrorBoundary';
import { APP_TITLE } from './lib/appMeta';

export default function App() {
  useEffect(() => {
    document.title = APP_TITLE;
  }, []);

  return (
    <BrowserRouter>
      <AuthProvider>
        <GameProvider>
          <GrandNotificationProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/chat" element={<ErrorBoundary><Chat /></ErrorBoundary>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </GrandNotificationProvider>
        </GameProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
