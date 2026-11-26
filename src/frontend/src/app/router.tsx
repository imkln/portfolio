import { createBrowserRouter, useOutletContext, useParams } from 'react-router';
import App from './App';
import Collection from './routes/Collection';
import Home from './routes/Home';
import Photos from './routes/Photos';
import type { AppRouteContext } from './App';

function HomeRoute() {
  const { signedIn, navigate } = useOutletContext<AppRouteContext>();
  return <Home canEdit={signedIn === true} onOpen={navigate} />;
}

function CollectionRoute() {
  const { signedIn } = useOutletContext<AppRouteContext>();
  const { id } = useParams();
  if (!id || !/^[a-z0-9-]+$/.test(id)) return <HomeRoute />;
  return <Collection key={id} id={id} canEdit={signedIn === true} />;
}

function PhotosRoute() {
  const { signedIn } = useOutletContext<AppRouteContext>();
  return <Photos signedIn={signedIn} />;
}

export const router = createBrowserRouter([
  {
    element: <App />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'collections/:id', element: <CollectionRoute /> },
      { path: 'photos', element: <PhotosRoute /> },
      { path: '*', element: <HomeRoute /> },
    ],
  },
]);
