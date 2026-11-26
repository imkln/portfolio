import type { MouseEvent } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import Header from '../components/layouts/header/Header';
import { useOwnerSession } from '../features/session/api/session';

export type AppRouteContext = {
  signedIn: boolean | null;
  navigate: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function App() {
  const { data } = useOwnerSession();
  const signedIn = data ?? null;
  const { pathname } = useLocation();
  const open = useNavigate();

  function navigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    void open(event.currentTarget.pathname);
    window.scrollTo(0, 0);
  }

  const context: AppRouteContext = { signedIn, navigate };
  return (
    <>
      <Header path={pathname} signedIn={signedIn} onNavigate={navigate} />
      <div className="frame">
        <Outlet context={context} />
      </div>
    </>
  );
}
