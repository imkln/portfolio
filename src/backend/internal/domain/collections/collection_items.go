package collections

import "github.com/imkln/portfolio/src/backend/internal/domain/photos"

type Items []CollectionItem

type CollectionItem struct {
	ID           string  `json:"id"`
	Kind         string  `json:"kind"`
	CoverPhotoID *string `json:"coverPhotoId,omitempty"`
	Text         *string `json:"text,omitempty"`
	Layout
	Height    *float64 `json:"height,omitempty"`
	LargeText bool     `json:"largeText,omitempty"`
	LightText bool     `json:"lightText,omitempty"`
}

func (items Items) Valid() bool {
	if items == nil {
		return false
	}

	ids := make(map[string]bool, len(items))
	for _, item := range items {
		if ids[item.ID] || !item.Valid() {
			return false
		}
		ids[item.ID] = true
	}
	return true
}

func (item CollectionItem) Valid() bool {
	if !collectionID.MatchString(item.ID) || !item.Layout.Valid() {
		return false
	}

	switch item.Kind {
	case "photo":
		return item.CoverPhotoID != nil && photos.ValidID(*item.CoverPhotoID) &&
			item.Text == nil && item.Height == nil && !item.LargeText && !item.LightText
	case "caption":
		return item.Text != nil && item.Height != nil && *item.Height > 0 && item.CoverPhotoID == nil
	default:
		return false
	}
}
