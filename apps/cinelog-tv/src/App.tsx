import { useCallback, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Home } from './screens/home';
import { MovieDetail } from './screens/movie-detail';
import { Pairing } from './screens/pairing';
import { DevScreenGuide } from './dev-screen-guide';
import { hasSession, clearSession } from './lib/auth';

export function App() {
  // The TV renders the user's library only when paired; otherwise it shows the
  // pairing screen so the user can link it from the web app.
  const [authed, setAuthed] = useState(() => hasSession());

  const handlePaired = useCallback(() => setAuthed(true), []);
  const handleSignOut = useCallback(() => {
    clearSession();
    setAuthed(false);
  }, []);

  return (
    <>
      {/* Dev-only: frames the 1920x1080 TV screen + safe area in the browser.
          Compiled out of the production .wgt via import.meta.env.DEV. */}
      {import.meta.env.DEV && <DevScreenGuide />}
      {authed ? (
        <Routes>
          <Route path="/" element={<Home onSignOut={handleSignOut} />} />
          <Route
            path="/movie/:slug"
            element={<MovieDetail onSignOut={handleSignOut} />}
          />
        </Routes>
      ) : (
        <Pairing onPaired={handlePaired} />
      )}
    </>
  );
}
