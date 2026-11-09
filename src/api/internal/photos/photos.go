package photos

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

const (
	pageSize         = 24
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
}

type page struct {
	Photos        []Photo `json:"photos"`
	NextPageToken string  `json:"nextPageToken,omitempty"`
}

type handler struct {
	store   Store
	isOwner func(*http.Request) bool
}

func Register(mux *http.ServeMux, store Store, isOwner func(*http.Request) bool) {
	app := handler{store: store, isOwner: isOwner}
	mux.HandleFunc("GET /api/photos", app.list)
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
