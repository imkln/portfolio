package photos

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode"
)

const (
	pageSize         = 24
	jpegType         = "image/jpeg"
	maxUploadBytes   = 64 << 20
	maxUploadRequest = 4 << 10
	uploadTimeLayout = "2006-01-02T15:04:05.000000000Z"
)

var (
	photoID          = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)
	invalidPageToken = errors.New("invalid page token")
)

type Photo struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	UploadedAt time.Time `json:"uploadedAt"`
}

type Store interface {
	ListReady(ctx context.Context, after string, limit int32) ([]Photo, string, error)
	IsReady(ctx context.Context, id string) (bool, error)
	BeginDelete(ctx context.Context, id string) (bool, error)
	FinishDelete(ctx context.Context, id string) error
}

type FileStore interface {
	SignUpload(ctx context.Context, name string, size int64) (UploadForm, error)
	OriginalURL(ctx context.Context, id string) (string, error)
	ThumbnailURL(ctx context.Context, id string) (string, error)
	DeletePhoto(ctx context.Context, id string) error
}

type UploadForm struct {
	URL    string            `json:"url"`
	Fields map[string]string `json:"fields"`
}

type uploadRequest struct {
	Name        string `json:"name"`
	ContentType string `json:"contentType"`
	Size        int64  `json:"size"`
}

type page struct {
	Photos        []Photo `json:"photos"`
	NextPageToken string  `json:"nextPageToken,omitempty"`
}

type handler struct {
	store   Store
	files   FileStore
	isOwner func(*http.Request) bool
}

func Register(mux *http.ServeMux, store Store, files FileStore, isOwner func(*http.Request) bool) {
	app := handler{store: store, files: files, isOwner: isOwner}
	mux.HandleFunc("GET /api/photos", app.list)
	mux.HandleFunc("POST /api/photos", app.create)
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

	var after string
	if tokens, exists := params["pageToken"]; exists {
		if len(tokens) != 1 {
			writeError(w, http.StatusBadRequest)
			return
		}
		after, err = readPageToken(tokens[0])
		if err != nil {
			writeError(w, http.StatusBadRequest)
			return
		}
	}

	items, next, err := app.store.ListReady(r.Context(), after, pageSize)
	if err != nil {
		slog.ErrorContext(r.Context(), "list photos", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []Photo{}
	}

	writeJSON(w, http.StatusOK, page{
		Photos:        items,
		NextPageToken: base64.RawURLEncoding.EncodeToString([]byte(next)),
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
	return file.ContentType == jpegType && file.Size > 0 && file.Size <= maxUploadBytes &&
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
		if !photoID.MatchString(id) {
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
	if !photoID.MatchString(id) {
		writeError(w, http.StatusNotFound)
		return
	}

	ctx := r.Context()
	started, err := app.store.BeginDelete(ctx, id)
	if err != nil {
		slog.ErrorContext(ctx, "mark photo for deletion", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}
	if !started {
		writeError(w, http.StatusNotFound)
		return
	}

	if err := app.files.DeletePhoto(ctx, id); err != nil {
		slog.ErrorContext(ctx, "delete photo files", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}
	if err := app.store.FinishDelete(ctx, id); err != nil {
		slog.ErrorContext(ctx, "remove photo record", "error", err)
		writeError(w, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func readPageToken(token string) (string, error) {
	if len(token) > base64.RawURLEncoding.EncodedLen(len(uploadTimeLayout)+1+128) {
		return "", invalidPageToken
	}

	key, err := base64.RawURLEncoding.Strict().DecodeString(token)
	if err != nil {
		return "", invalidPageToken
	}

	stamp, id, ok := strings.Cut(string(key), "#")
	if !ok || len(stamp) != len(uploadTimeLayout) || !photoID.MatchString(id) {
		return "", invalidPageToken
	}
	if _, err := time.Parse(uploadTimeLayout, stamp); err != nil {
		return "", invalidPageToken
	}
	return string(key), nil
}

func writeError(w http.ResponseWriter, status int) {
	writeJSON(w, status, map[string]string{"error": http.StatusText(status)})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
