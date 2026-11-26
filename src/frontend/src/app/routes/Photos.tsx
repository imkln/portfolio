import PhotoLibrary from '../../features/photos/components/PhotoLibrary';

export default function Photos({ signedIn }: { signedIn: boolean | null }) {
  if (signedIn === true) return <PhotoLibrary />;

  return (
    <main className="photos-page">
      {signedIn === false ? <p>Sign in to view photos.</p> : <p role="status">Checking session…</p>}
    </main>
  );
}
