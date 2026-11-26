package usecase

import (
	"context"

	"github.com/imkln/portfolio/src/backend/internal/domain/collections"
	"github.com/imkln/portfolio/src/backend/internal/domain/photos"
)

type CollectionStore interface {
	Load(context.Context) (collections.List, error)
	Update(context.Context, func(*collections.List) error) error
}

type Collections struct{ store CollectionStore }

func (app Collections) Replace(ctx context.Context, replacement collections.List) error {
	return app.store.Update(ctx, func(current *collections.List) error {
		itemsByID := make(map[string]*collections.Items, len(current.Collections))
		for _, collection := range current.Collections {
			itemsByID[collection.ID] = collection.Items
		}

		for i, collection := range replacement.Collections {
			replacement.Collections[i].Items = itemsByID[collection.ID]
		}

		*current = replacement
		return nil
	})
}

func (app Collections) ReplaceItems(ctx context.Context, id string, items collections.Items) error {
	return app.store.Update(ctx, func(list *collections.List) error {
		collection := list.Find(id)
		if collection == nil {
			return collections.ErrNotFound
		}
		collection.Items = &items
		return nil
	})
}

func (app Collections) Get(ctx context.Context, id string) (collections.Collection, collections.Items, error) {
	list, err := app.store.Load(ctx)
	if err != nil {
		return collections.Collection{}, nil, err
	}

	collection := list.Find(id)
	if collection == nil {
		return collections.Collection{}, nil, collections.ErrNotFound
	}

	var collectionItems collections.Items
	if collection.Items != nil {
		collectionItems = *collection.Items
	} else if collection.CoverPhotoID != nil && photos.ValidID(*collection.CoverPhotoID) {
		collectionItems = collections.Items{{
			ID:           "cover",
			Kind:         "photo",
			CoverPhotoID: collection.CoverPhotoID,
			Layout:       collections.Layout{X: new(0.0), Y: new(0.0), Width: new(0.53)},
		}}
	}

	return *collection, collectionItems, nil
}

func NewCollections(store CollectionStore) Collections {
	return Collections{store: store}
}
