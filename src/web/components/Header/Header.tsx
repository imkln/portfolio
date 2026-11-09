import type { MouseEventHandler } from 'react';
import './Header.css';

type Props = {
  path: string;
  signedIn: boolean | null;
  onNavigate: MouseEventHandler<HTMLAnchorElement>;
};

export default function Header({ path, signedIn, onNavigate }: Props) {
  return (
    <header className="mast">
      <nav aria-label="Main">
        <a
          href="/"
          onClick={onNavigate}
          aria-current={path === '/' ? 'page' : undefined}
        >
          Home
        </a>
        {signedIn === true && (
          <a
            href="/photos"
            onClick={onNavigate}
            aria-current={path === '/photos' ? 'page' : undefined}
          >
            Photos
          </a>
        )}
      </nav>
      {signedIn === false && (
        <a className="session-action" href="/auth/login">
          Sign in
        </a>
      )}
      {signedIn === true && (
        <form action="/auth/logout" method="post">
          <button className="session-action" type="submit">
            Sign out
          </button>
        </form>
      )}
    </header>
  );
}
