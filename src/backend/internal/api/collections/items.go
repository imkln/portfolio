package collections

import (
	"errors"
	"log/slog"
	"net/http"
	"slices"

	"github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

type Item struct {
	ID           string   `json:"id"`
	Kind         string   `json:"kind"`
	CoverPhotoID *string  `json:"coverPhotoId,omitempty"`
	Text         *string  `json:"text,omitempty"`
	X            *float64 `json:"x"`
	Y            *float64 `json:"y"`
	Width        *float64 `json:"width"`
	Height       *float64 `json:"height,omitempty"`
	LargeText    bool     `json:"largeText,omitempty"`
	LightText    bool     `json:"lightText,omitempty"`
}

type listedItem struct {
	Item
	CoverPhotoURL string `json:"coverPhotoUrl,omitempty"`
}

var errCollectionNotFound = errors.New("collection not found")

func (app *handler) get(w http.ResponseWriter, r *http.Request) {
	config, err := app.store.Load(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "read collection", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}

	index := collectionIndex(config, r.PathValue("id"))
	if index < 0 {
		writeError(w, http.StatusNotFound)
		return
	}

	collection := config.Collections[index]
	savedItems := []Item{}
	if collection.Items != nil {
		savedItems = *collection.Items
	} else if collection.CoverPhotoID != nil && photos.ValidID(*collection.CoverPhotoID) {
		x, y, width := 0.0, 0.0, 0.53
		savedItems = append(savedItems, Item{
			ID: "cover", Kind: "photo", CoverPhotoID: collection.CoverPhotoID,
			X: &x, Y: &y, Width: &width,
		})
	}

	items := make([]listedItem, 0, len(savedItems))
	for _, item := range savedItems {
		items = append(items, listedItem{
			Item:          item,
			CoverPhotoURL: app.coverURL(r.Context(), item.CoverPhotoID),
		})
	}

	writeJSON(w, http.StatusOK, struct {
		listedCollection
		Items []listedItem `json:"items"`
	}{app.withCover(r.Context(), collection), items})
}

func (app *handler) updateItems(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}

	var update struct {
		Items []Item `json:"items"`
	}
	if !decodeUpdate(w, r, &update) || !validItems(update.Items) {
		writeError(w, http.StatusBadRequest)
		return
	}

	err := app.store.Update(r.Context(), func(config *List) error {
		index := collectionIndex(*config, r.PathValue("id"))
		if index < 0 {
			return errCollectionNotFound
		}
		config.Collections[index].Items = &update.Items
		return nil
	})
	writeUpdateResult(w, r, err)
}

func collectionIndex(config List, id string) int {
	return slices.IndexFunc(config.Collections, func(collection Collection) bool {
		return collection.ID == id
	})
}

func validItems(items []Item) bool {
	if items == nil {
		return false
	}
	ids := make(map[string]bool, len(items))
	for _, item := range items {
		if !collectionID.MatchString(item.ID) || ids[item.ID] || !validLayout(item.X, item.Y, item.Width) {
			return false
		}
		switch item.Kind {
		case "photo":
			if item.CoverPhotoID == nil || !photos.ValidID(*item.CoverPhotoID) || item.Text != nil || item.Height != nil || item.LargeText || item.LightText {
				return false
			}
		case "caption":
			if item.Text == nil || item.Height == nil || *item.Height <= 0 || item.CoverPhotoID != nil {
				return false
			}
		default:
			return false
		}
		ids[item.ID] = true
	}
	return true
}
