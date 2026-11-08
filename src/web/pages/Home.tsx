import type { MouseEvent } from 'react';
import CollectionBoard from '../components/CollectionBoard/CollectionBoard';
import type { Collection } from '../data/Collection';

type Props = {
  collections: Collection[];
  onSave: (collections: Collection[]) => void;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
};

export default function Home(props: Props) {
  return <CollectionBoard {...props} />;
}
