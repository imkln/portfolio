package usecase

import (
	"context"
	"slices"

	photostore "github.com/imkln/portfolio/src/backend/internal/domain/photos"
	"github.com/imkln/portfolio/src/backend/internal/domain/tags"
)

type PhotoStore interface {
	ListReady(ctx context.Context, pageToken string, limit int32) ([]photostore.Photo, string, error)
	EditTags(ctx context.Context, photoIDs, add, remove []string, catalogRevision *string) error
	IsReady(ctx context.Context, id string) (bool, error)
	CanDelete(ctx context.Context, id string) (bool, error)
	MarkDeleted(ctx context.Context, id string) (bool, error)
}

type TagCatalog interface {
	List(context.Context) ([]tags.Tag, error)
	Snapshot(context.Context) ([]tags.Tag, *string, error)
}

type FileStore interface {
	SignUpload(ctx context.Context, name string, size int64) (photostore.UploadForm, error)
	OriginalURL(ctx context.Context, id string) (string, error)
	ThumbnailURL(ctx context.Context, id string) (string, error)
	DeletePhoto(ctx context.Context, id string) error
}

func (app Photos) AssignTags(ctx context.Context, photoIDs, add, remove []string) error {
	var revision *string
	if len(add) > 0 {
		catalog, current, err := app.catalog.Snapshot(ctx)
		if err != nil {
			return err
		}
		for _, id := range add {
			if !slices.ContainsFunc(catalog, func(tag tags.Tag) bool { return tag.ID == id }) {
				return tags.ErrUnknownTag
			}
		}
		revision = current
	}

	return app.store.EditTags(ctx, photoIDs, add, remove, revision)
}

type Photos struct {
	store   PhotoStore
	catalog TagCatalog
}

func NewPhotos(store PhotoStore, catalog TagCatalog) Photos {
	return Photos{store: store, catalog: catalog}
}
