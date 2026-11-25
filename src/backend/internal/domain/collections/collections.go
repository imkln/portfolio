package collections

import (
	"errors"
	"regexp"
)

type List struct {
	Collections []Collection `json:"collections"`
}

type Collection struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Metadata     string  `json:"metadata"`
	CoverPhotoID *string `json:"coverPhotoId"`
	Layout
	TextLayout *Layout `json:"textLayout,omitempty"`
	LargeText  bool    `json:"largeText,omitempty"`
	LightText  bool    `json:"lightText,omitempty"`
	Items      *Items  `json:"items,omitempty"`
}

type Layout struct {
	X     *float64 `json:"x"`
	Y     *float64 `json:"y"`
	Width *float64 `json:"width"`
}

const MaxBytes = 256 << 10

var (
	collectionID        = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	collectionText      = regexp.MustCompile(`^[\p{L}\p{N}\p{P} ]*$`)
	ErrConcurrentUpdate = errors.New("collections changed during update")
	ErrNotFound         = errors.New("collection not found")
	ErrTooLarge         = errors.New("collections exceed the size limit")
)

func (list *List) Find(id string) *Collection {
	for i := range list.Collections {
		if list.Collections[i].ID == id {
			return &list.Collections[i]
		}
	}
	return nil
}

func (list List) Valid() bool {
	if list.Collections == nil {
		return false
	}

	ids := make(map[string]bool, len(list.Collections))
	for _, collection := range list.Collections {
		if !collectionID.MatchString(collection.ID) || ids[collection.ID] || !collection.Layout.Valid() || collection.Items != nil {
			return false
		}
		if !collectionText.MatchString(collection.Title) || !collectionText.MatchString(collection.Metadata) {
			return false
		}
		if text := collection.TextLayout; text != nil && !text.Valid() {
			return false
		}
		ids[collection.ID] = true
	}
	return true
}

func (layout Layout) Valid() bool {
	return layout.X != nil && layout.Y != nil && layout.Width != nil &&
		*layout.X >= 0 && *layout.Y >= 0 && *layout.Width > 0 && *layout.Width <= 1 && *layout.X+*layout.Width <= 1+1e-9
}
