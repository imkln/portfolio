package collections

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"regexp"
	"strings"

	"github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

type List struct {
	Collections []Collection `json:"collections"`
}

type Collection struct {
	ID           string      `json:"id"`
	Title        string      `json:"title"`
	Metadata     string      `json:"metadata"`
	CoverPhotoID *string     `json:"coverPhotoId"`
	X            *float64    `json:"x"`
	Y            *float64    `json:"y"`
	Width        *float64    `json:"width"`
	TextLayout   *TextLayout `json:"textLayout,omitempty"`
	LargeText    bool        `json:"largeText,omitempty"`
	LightText    bool        `json:"lightText,omitempty"`
	Items        *[]Item     `json:"items,omitempty"`
}

type TextLayout struct {
	X     *float64 `json:"x"`
	Y     *float64 `json:"y"`
	Width *float64 `json:"width"`
}

type listedCollection struct {
	Collection
	CoverPhotoURL string `json:"coverPhotoUrl,omitempty"`
}

type Store interface {
	Load(context.Context) (List, error)
	Update(context.Context, func(*List) error) error
}

const maxListBytes = 256 << 10

var (
	collectionID    = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)
	errListTooLarge = errors.New("collections exceed the size limit")
)

func (app *handler) list(w http.ResponseWriter, r *http.Request) {
	config, err := app.store.Load(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "read collections", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}

	items := make([]listedCollection, 0, len(config.Collections))
	for _, collection := range config.Collections {
		collection.Items = nil
		items = append(items, app.withCover(r.Context(), collection))
	}
	writeJSON(w, http.StatusOK, struct {
		Collections []listedCollection `json:"collections"`
	}{Collections: items})
}

func (app *handler) replace(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}

	var config List
	if !decodeUpdate(w, r, &config) || !config.valid() {
		writeError(w, http.StatusBadRequest)
		return
	}

	err := app.store.Update(r.Context(), func(current *List) error {
		itemsByID := make(map[string]*[]Item, len(current.Collections))
		for _, collection := range current.Collections {
			itemsByID[collection.ID] = collection.Items
		}
		for index := range config.Collections {
			collection := &config.Collections[index]
			collection.Items = itemsByID[collection.ID]
		}
		*current = config
		return nil
	})
	writeUpdateResult(w, r, err)
}

func (config List) valid() bool {
	if config.Collections == nil {
		return false
	}

	ids := make(map[string]bool, len(config.Collections))
	for _, item := range config.Collections {
		if !collectionID.MatchString(item.ID) || ids[item.ID] || !validLayout(item.X, item.Y, item.Width) || item.Items != nil {
			return false
		}
		if strings.ContainsAny(item.Title, "\r\n") || strings.ContainsAny(item.Metadata, "\r\n") {
			return false
		}
		if text := item.TextLayout; text != nil && !validLayout(text.X, text.Y, text.Width) {
			return false
		}
		ids[item.ID] = true
	}
	return true
}

func validLayout(x, y, width *float64) bool {
	return x != nil && y != nil && width != nil &&
		*x >= 0 && *y >= 0 && *width > 0 && *width <= 1 && *x+*width <= 1+1e-9
}

func decodeUpdate(w http.ResponseWriter, r *http.Request, value any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxListBytes))
	decoder.DisallowUnknownFields()
	return decoder.Decode(value) == nil && decoder.Decode(new(any)) == io.EOF
}

func writeUpdateResult(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, errListTooLarge):
		writeError(w, http.StatusBadRequest)
	case errors.Is(err, errCollectionNotFound):
		writeError(w, http.StatusNotFound)
	case errors.Is(err, errConcurrentUpdate):
		writeError(w, http.StatusConflict)
	default:
		slog.ErrorContext(r.Context(), "save collections", "error", err)
		writeError(w, http.StatusInternalServerError)
	}
}

func (app *handler) withCover(ctx context.Context, collection Collection) listedCollection {
	return listedCollection{
		Collection:    collection,
		CoverPhotoURL: app.coverURL(ctx, collection.CoverPhotoID),
	}
}

func (app *handler) coverURL(ctx context.Context, id *string) string {
	if id == nil || !photos.ValidID(*id) {
		return ""
	}
	original, err := app.originalURL(ctx, *id)
	if err != nil {
		slog.ErrorContext(ctx, "sign collection photo", "error", err)
		return ""
	}
	return original
}

type handler struct {
	store       Store
	isOwner     func(*http.Request) bool
	originalURL func(context.Context, string) (string, error)
}

func Register(
	mux *http.ServeMux,
	store Store,
	isOwner func(*http.Request) bool,
	originalURL func(context.Context, string) (string, error),
) {
	app := handler{store: store, isOwner: isOwner, originalURL: originalURL}
	mux.HandleFunc("GET /api/collections", app.list)
	mux.HandleFunc("PUT /api/collections", app.replace)
	mux.HandleFunc("GET /api/collections/{id}", app.get)
	mux.HandleFunc("PATCH /api/collections/{id}", app.updateItems)
}

func writeError(w http.ResponseWriter, status int) {
	writeJSON(w, status, map[string]string{"error": http.StatusText(status)})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
