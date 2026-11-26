package usecase

import (
	"context"
	"crypto/rand"
	"slices"
	"strings"
	"unicode"

	"github.com/imkln/portfolio/src/backend/internal/domain/tags"
)

type TagStore interface {
	List(context.Context) ([]tags.Tag, error)
	Update(context.Context, func([]tags.Tag) ([]tags.Tag, error)) error
}

type Tags struct {
	store TagStore
}

func (app Tags) Create(ctx context.Context, name, parentID string) (tags.Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 90 || strings.ContainsAny(name, "›>") || strings.ContainsFunc(name, unicode.IsControl) {
		return tags.Tag{}, tags.ErrInvalidName
	}

	tag := tags.Tag{ID: rand.Text(), Name: name, ParentID: parentID}
	err := app.store.Update(ctx, func(catalog []tags.Tag) ([]tags.Tag, error) {
		if parentID != "" && tagIndex(catalog, parentID) == -1 {
			return nil, tags.ErrMissingParent
		}
		for _, existing := range catalog {
			if existing.ParentID == parentID && strings.EqualFold(existing.Name, name) {
				return nil, tags.ErrDuplicateName
			}
		}
		return append(catalog, tag), nil
	})
	if err != nil {
		return tags.Tag{}, err
	}
	return tag, nil
}

func (app Tags) Delete(ctx context.Context, id string) error {
	return app.store.Update(ctx, func(catalog []tags.Tag) ([]tags.Tag, error) {
		index := tagIndex(catalog, id)
		if index == -1 {
			return nil, tags.ErrUnknownTag
		}
		for _, tag := range catalog {
			if tag.ParentID == id {
				return nil, &tags.HasSubtags{Name: catalog[index].Name}
			}
		}
		return slices.Delete(catalog, index, index+1), nil
	})
}

func tagIndex(catalog []tags.Tag, id string) int {
	return slices.IndexFunc(catalog, func(tag tags.Tag) bool { return tag.ID == id })
}

func NewTags(store TagStore) Tags {
	return Tags{store: store}
}
