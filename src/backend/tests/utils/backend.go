package utils

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	"github.com/imkln/portfolio/src/backend/internal/api/handler/auth"
	"github.com/imkln/portfolio/src/backend/internal/api/server"
	"github.com/imkln/portfolio/src/backend/internal/domain/photos"
	collectionsstore "github.com/imkln/portfolio/src/backend/internal/infra/persistence/collections"
	tagsstore "github.com/imkln/portfolio/src/backend/internal/infra/persistence/tags"
	"github.com/imkln/portfolio/src/backend/internal/worker"
)

func localBackend(t *testing.T) string {
	t.Helper()
	identity := NewIdentityProvider(t)
	library := &localLibrary{photos: make(map[string]*localPhoto)}
	files := httptest.NewServer(library)
	t.Cleanup(files.Close)
	library.origin = files.URL

	api := httptest.NewUnstartedServer(nil)
	origin := "http://" + api.Listener.Addr().String()
	handler, err := server.New(t.Context(), auth.Config{
		Origin: origin, Issuer: identity.URL, AuthDomain: identity.URL,
		ClientID: "test-client", OwnerEmail: OwnerEmail, CookieKey: strings.Repeat("ab", 32),
	}, fstest.MapFS{"index.html": {Data: []byte("<!doctype html><title>Portfolio</title>")}},
		collectionsstore.NewDynamoStore(NewFakeDynamoClient(t), "collections"),
		library, tagsstore.NewDynamoStore(NewFakeDynamoClient(t), "tags"),
		library, "https://uploads.example.test")
	if err != nil {
		api.Close()
		t.Fatal(err)
	}
	api.Config.Handler = handler
	api.Start()
	t.Cleanup(api.Close)

	return api.URL
}

type localPhoto struct {
	photo                       photos.Photo
	state                       string
	upload, original, thumbnail []byte
}

type localLibrary struct {
	mu     sync.Mutex
	origin string
	next   int
	photos map[string]*localPhoto
}

func (library *localLibrary) ListReady(_ context.Context, token string, limit int32) ([]photos.Photo, string, error) {
	library.mu.Lock()
	defer library.mu.Unlock()

	offset := 0
	if token != "" {
		var err error
		offset, err = strconv.Atoi(token)
		if err != nil || offset < 0 {
			return nil, "", photos.ErrInvalidPageToken
		}
	}
	var ready []photos.Photo
	for _, entry := range library.photos {
		if entry.state == "ready" {
			photo := entry.photo
			photo.TagIDs = slices.Clone(photo.TagIDs)
			ready = append(ready, photo)
		}
	}
	slices.SortFunc(ready, func(a, b photos.Photo) int { return b.UploadedAt.Compare(a.UploadedAt) })
	if offset >= len(ready) {
		return nil, "", nil
	}
	end := min(offset+int(limit), len(ready))
	if end == len(ready) {
		return ready[offset:end], "", nil
	}
	return ready[offset:end], strconv.Itoa(end), nil
}

func (library *localLibrary) EditTags(_ context.Context, ids, add, remove []string, _ *string) error {
	library.mu.Lock()
	defer library.mu.Unlock()

	for _, id := range ids {
		if entry := library.photos[id]; entry == nil || entry.state != "ready" {
			return photos.ErrPhotoNotFound
		}
	}
	for _, id := range ids {
		photo := &library.photos[id].photo
		photo.TagIDs = slices.DeleteFunc(photo.TagIDs, func(id string) bool { return slices.Contains(remove, id) })
		for _, tag := range add {
			if !slices.Contains(photo.TagIDs, tag) {
				photo.TagIDs = append(photo.TagIDs, tag)
			}
		}
	}
	return nil
}

func (library *localLibrary) PhotoState(_ context.Context, id string) (string, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	if entry := library.photos[id]; entry != nil {
		return entry.state, nil
	}
	return "", nil
}

func (library *localLibrary) IsReady(ctx context.Context, id string) (bool, error) {
	state, err := library.PhotoState(ctx, id)
	return state == "ready", err
}

func (library *localLibrary) CanDelete(ctx context.Context, id string) (bool, error) {
	state, err := library.PhotoState(ctx, id)
	return state == "ready" || state == photos.DeletedState, err
}

func (library *localLibrary) MarkDeleted(_ context.Context, id string) (bool, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	entry := library.photos[id]
	if entry == nil {
		return false, nil
	}
	entry.state = photos.DeletedState
	return true, nil
}

func (library *localLibrary) SignUpload(_ context.Context, name string, _ int64) (photos.UploadForm, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	library.next++
	id := fmt.Sprintf("photo-%d", library.next)
	library.photos[id] = &localPhoto{photo: photos.Photo{ID: id, Name: name}}
	return photos.UploadForm{URL: library.origin + "/upload/" + id, Fields: map[string]string{}}, nil
}

func (library *localLibrary) OriginalURL(_ context.Context, id string) (string, error) {
	return library.origin + "/original/" + id, nil
}

func (library *localLibrary) ThumbnailURL(_ context.Context, id string) (string, error) {
	return library.origin + "/thumbnail/" + id, nil
}

func (library *localLibrary) DeletePhoto(_ context.Context, id string) error {
	library.mu.Lock()
	defer library.mu.Unlock()
	entry := library.photos[id]
	entry.original, entry.thumbnail = nil, nil
	return nil
}

func (library *localLibrary) ReadUpload(_ context.Context, key string) (string, []byte, error) {
	id, _ := photos.UploadID(key)
	library.mu.Lock()
	defer library.mu.Unlock()
	entry := library.photos[id]
	if entry == nil {
		return "", nil, errors.New("unknown upload")
	}
	return entry.photo.Name, entry.upload, nil
}

func (library *localLibrary) SavePhoto(_ context.Context, id string, original, thumbnail []byte) error {
	library.mu.Lock()
	defer library.mu.Unlock()
	entry := library.photos[id]
	entry.original, entry.thumbnail = original, thumbnail
	return nil
}

func (library *localLibrary) SaveReady(_ context.Context, photo photos.Photo) (bool, error) {
	library.mu.Lock()
	defer library.mu.Unlock()
	entry := library.photos[photo.ID]
	if entry.state != "" {
		return false, nil
	}
	entry.photo, entry.state = photo, "ready"
	return true, nil
}

func (library *localLibrary) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	kind, id, _ := strings.Cut(strings.TrimPrefix(r.URL.Path, "/"), "/")
	if r.Method == http.MethodPost && kind == "upload" {
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "upload file is missing", http.StatusBadRequest)
			return
		}
		defer func() { _ = file.Close() }()

		var data []byte
		data, err = io.ReadAll(file)
		if err != nil {
			http.Error(w, "upload cannot be read", http.StatusBadRequest)
			return
		}
		library.mu.Lock()
		entry := library.photos[id]
		if entry != nil {
			entry.upload = data
		}
		library.mu.Unlock()
		if entry == nil {
			http.NotFound(w, r)
			return
		}
		if err := worker.New(library, library).Process(r.Context(), "uploads/"+id+".jpg", time.Now()); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	library.mu.Lock()
	defer library.mu.Unlock()
	entry := library.photos[id]
	if r.Method != http.MethodGet || entry == nil || entry.state != "ready" {
		http.NotFound(w, r)
		return
	}
	switch kind {
	case "original":
		_, _ = w.Write(entry.original)
	case "thumbnail":
		_, _ = w.Write(entry.thumbnail)
	default:
		http.NotFound(w, r)
	}
}
