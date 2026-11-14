package photos

import (
	"context"
	"slices"

	photostore "github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

func (app *handler) listPhotos(ctx context.Context, token string, filters []string) ([]photostore.Photo, string, error) {
	tags, err := app.catalog.List(ctx)
	if err != nil {
		return nil, "", err
	}
	parents := make(map[string]string, len(tags))
	for _, tag := range tags {
		parents[tag.ID] = tag.ParentID
	}

	photos, next, err := app.store.ListReady(ctx, token, pageSize)
	if err != nil {
		return nil, "", err
	}

	matches := make([]photostore.Photo, 0, len(photos))
	for _, photo := range photos {
		if len(filters) == 0 || matchesTags(photo.TagIDs, filters, parents) {
			photo.TagIDs = slices.DeleteFunc(photo.TagIDs, func(id string) bool {
				_, exists := parents[id]
				return !exists
			})
			matches = append(matches, photo)
		}
	}

	return matches, next, nil
}

func matchesTags(photoTags, filters []string, parents map[string]string) bool {
	matches := make(map[string]bool)
	for _, id := range photoTags {
		for id != "" && !matches[id] {
			parent, exists := parents[id]
			if !exists {
				break
			}
			matches[id] = true
			id = parent
		}
	}

	for _, filter := range filters {
		if !matches[filter] {
			return false
		}
	}
	return true
}
