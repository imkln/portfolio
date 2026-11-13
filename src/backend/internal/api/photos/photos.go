package photos

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"unicode"

	"github.com/imkln/portfolio/src/backend/internal/api/tags"
	photostore "github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

const (
	pageSize         = 24
	maxUploadRequest = 4 << 10
)

type Store interface {
	ListReady(ctx context.Context, pageToken string, limit int32) ([]photostore.Photo, string, error)
	EditTags(ctx context.Context, photoIDs, add, remove []string) error
	IsReady(ctx context.Context, id string) (bool, error)
	CanDelete(ctx context.Context, id string) (bool, error)
	MarkDeleted(ctx context.Context, id string) (bool, error)
}

type FileStore interface {
	SignUpload(ctx context.Context, name string, size int64) (photostore.UploadForm, error)
	OriginalURL(ctx context.Context, id string) (string, error)
	ThumbnailURL(ctx context.Context, id string) (string, error)
	DeletePhoto(ctx context.Context, id string) error
}

type uploadRequest struct {
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}

type page struct {
	Photos        []photostore.Photo `json:"photos"`
	NextPageToken string             `json:"nextPageToken,omitempty"`
}

type handler struct {
	store    Store
	loadTags func(context.Context) ([]tags.Tag, error)
	files    FileStore
	isOwner  func(*http.Request) bool
}

func Register(mux *http.ServeMux, store Store, files FileStore, loadTags func(context.Context) ([]tags.Tag, error), isOwner func(*http.Request) bool) {
	app := handler{store: store, loadTags: loadTags, files: files, isOwner: isOwner}
	mux.HandleFunc("GET /api/photos", app.list)
	mux.HandleFunc("POST /api/photos", app.create)
	mux.HandleFunc("PATCH /api/photos", app.editTags)
	mux.HandleFunc("GET /api/photos/{id}", app.get(files.OriginalURL))
	mux.HandleFunc("GET /api/photos/{id}/thumbnail", app.get(files.ThumbnailURL))
	mux.HandleFunc("DELETE /api/photos/{id}", app.delete)
}

func (app *handler) list(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}

	params, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		writeError(w, http.StatusBadRequest)
		return
	}

	var token string
	if tokens, exists := params["pageToken"]; exists {
		if len(tokens) != 1 || tokens[0] == "" {
			writeError(w, http.StatusBadRequest)
			return
		}
		token = tokens[0]
	}

	filters := params["tagId"]
	if !uniqueIDs(filters) {
		writeError(w, http.StatusBadRequest)
		return
	}

	items, next, err := app.listPhotos(r.Context(), token, filters)
	if errors.Is(err, photostore.ErrInvalidPageToken) {
		writeError(w, http.StatusBadRequest)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "list photos", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []photostore.Photo{}
	}

	writeJSON(w, http.StatusOK, page{
		Photos:        items,
		NextPageToken: next,
	})
}

func (app *handler) create(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}

	var file uploadRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxUploadRequest))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&file) != nil || decoder.Decode(new(any)) != io.EOF || !file.valid() {
		writeError(w, http.StatusBadRequest)
		return
	}

	form, err := app.files.SignUpload(r.Context(), file.Name, file.Size)
	if err != nil {
		slog.ErrorContext(r.Context(), "sign photo upload", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, form)
}

func (file uploadRequest) valid() bool {
	return file.ContentType == photostore.JPEGType && file.Size > 0 && file.Size <= photostore.MaxUploadBytes &&
		len(file.Name) <= 255 && strings.TrimSpace(file.Name) != "" &&
		!strings.ContainsAny(file.Name, "/\\") && strings.IndexFunc(file.Name, unicode.IsControl) < 0
}

func (app *handler) get(readURL func(context.Context, string) (string, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !app.isOwner(r) {
			writeError(w, http.StatusUnauthorized)
			return
		}

		id := r.PathValue("id")
		if !photostore.ValidID(id) {
			writeError(w, http.StatusNotFound)
			return
		}

		ready, err := app.store.IsReady(r.Context(), id)
		if err != nil {
			slog.ErrorContext(r.Context(), "read photo state", "error", err)
			writeError(w, http.StatusInternalServerError)
			return
		}
		if !ready {
			writeError(w, http.StatusNotFound)
			return
		}

		location, err := readURL(r.Context(), id)
		if err != nil {
			slog.ErrorContext(r.Context(), "sign photo download", "error", err)
			writeError(w, http.StatusInternalServerError)
			return
		}

		http.Redirect(w, r, location, http.StatusTemporaryRedirect)
	}
}

func (app *handler) delete(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}

	id := r.PathValue("id")
	if !photostore.ValidID(id) {
		writeError(w, http.StatusNotFound)
		return
	}

	ctx := r.Context()
	found, err := photostore.DeletePhoto(ctx, app.store, app.files, id)
	if err != nil {
		slog.ErrorContext(ctx, "delete photo", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeError(w http.ResponseWriter, status int) {
	writeJSON(w, status, map[string]string{"error": http.StatusText(status)})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
