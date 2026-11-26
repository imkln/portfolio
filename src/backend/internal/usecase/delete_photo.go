package usecase

import (
	"context"
	"fmt"
)

type deletionFiles interface {
	DeletePhoto(context.Context, string) error
}

func (app Photos) Delete(ctx context.Context, files deletionFiles, id string) (bool, error) {
	found, err := app.store.CanDelete(ctx, id)
	if err != nil {
		return false, fmt.Errorf("read photo state: %w", err)
	}
	if !found {
		return false, nil
	}

	if err := files.DeletePhoto(ctx, id); err != nil {
		return false, fmt.Errorf("delete photo files: %w", err)
	}

	// Keep the deletion marker so delayed upload events cannot restore the photo.
	found, err = app.store.MarkDeleted(ctx, id)
	if err != nil {
		return false, fmt.Errorf("mark photo deleted: %w", err)
	}
	return found, nil
}
