package photos

import (
	"context"
	"fmt"
)

type deletionStore interface {
	CanDelete(context.Context, string) (bool, error)
	MarkDeleted(context.Context, string) (bool, error)
}

type deletionFiles interface {
	DeletePhoto(context.Context, string) error
}

func DeletePhoto(ctx context.Context, store deletionStore, files deletionFiles, id string) (bool, error) {
	found, err := store.CanDelete(ctx, id)
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
	found, err = store.MarkDeleted(ctx, id)
	if err != nil {
		return false, fmt.Errorf("mark photo deleted: %w", err)
	}
	return found, nil
}
