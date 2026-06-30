import { Routes, Route } from 'react-router-dom';
import { Home } from './screens/home';
import { DevScreenGuide } from './dev-screen-guide';

export function App() {
  return (
    <>
      {/* Dev-only: frames the 1920x1080 TV screen + safe area in the browser.
          Compiled out of the production .wgt via import.meta.env.DEV. */}
      {import.meta.env.DEV && <DevScreenGuide />}
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </>
  );
}
