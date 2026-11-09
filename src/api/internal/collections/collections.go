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
)

type List struct {
	Collections []Collection `json:"collections"`
}

type Collection struct {
	ID           string   `json:"id"`
	Title        string   `json:"title"`
	Metadata     string   `json:"metadata"`
	CoverPhotoID *string  `json:"coverPhotoId"`
	X            *float64 `json:"x"`
	Y            *float64 `json:"y"`
	Width        *float64 `json:"width"`
}

type Store interface {
	Load(context.Context) (List, error)
	Save(context.Context, List) error
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

	if config.Collections == nil {
		config.Collections = []Collection{}
	}
	writeJSON(w, http.StatusOK, config)
}

func (app *handler) replace(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}
	if r.Header.Get("Origin") != app.origin {
		writeError(w, http.StatusForbidden)
		return
	}

	var config List
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxListBytes))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&config) != nil || decoder.Decode(new(any)) != io.EOF || !config.valid() {
		writeError(w, http.StatusBadRequest)
		return
	}

	err := app.store.Save(r.Context(), config)
	if errors.Is(err, errListTooLarge) {
		writeError(w, http.StatusBadRequest)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "replace collections", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (config List) valid() bool {
	if config.Collections == nil {
		return false
	}

	ids := make(map[string]bool, len(config.Collections))
	for _, item := range config.Collections {
		if !collectionID.MatchString(item.ID) || ids[item.ID] || !item.validLayout() {
			return false
		}
		if strings.ContainsAny(item.Title, "\r\n") || strings.ContainsAny(item.Metadata, "\r\n") {
			return false
		}
		ids[item.ID] = true
	}
	return true
}

func (item Collection) validLayout() bool {
	if item.X == nil || item.Y == nil || item.Width == nil {
		return false
	}

	x, y, width := *item.X, *item.Y, *item.Width
	return x >= 0 && y >= 0 && width > 0 && width <= 1 && x+width <= 1+1e-9
}

type handler struct {
	store   Store
	origin  string
	isOwner func(*http.Request) bool
}

func Register(mux *http.ServeMux, store Store, origin string, isOwner func(*http.Request) bool) {
	app := handler{store: store, origin: origin, isOwner: isOwner}
	mux.HandleFunc("GET /api/collections", app.list)
	mux.HandleFunc("PUT /api/collections", app.replace)
}

func writeError(w http.ResponseWriter, status int) {
	writeJSON(w, status, map[string]string{"error": http.StatusText(status)})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
