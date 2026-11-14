package tags

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
)

type Tag struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId,omitempty"`
}

type Store interface {
	List(context.Context) ([]Tag, error)
	Create(context.Context, string, string) (Tag, error)
	Delete(context.Context, string) error
}

func Register(mux *http.ServeMux, store Store, isOwner func(*http.Request) bool) {
	app := handler{store: store}
	for route, handle := range map[string]http.HandlerFunc{
		"GET /api/tags":         app.list,
		"POST /api/tags":        app.create,
		"DELETE /api/tags/{id}": app.delete,
	} {
		mux.HandleFunc(route, func(w http.ResponseWriter, r *http.Request) {
			if !isOwner(r) {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
				return
			}

			handle(w, r)
		})
	}
}

type handler struct {
	store Store
}

func (app handler) list(w http.ResponseWriter, r *http.Request) {
	tags, err := app.store.List(r.Context())
	if err != nil {
		writeError(w, r, err)
		return
	}

	if tags == nil {
		tags = []Tag{}
	}

	writeJSON(w, http.StatusOK, tags)
}

func (app handler) create(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name     string `json:"name"`
		ParentID string `json:"parentId"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
	if err := decoder.Decode(&input); err != nil || decoder.Decode(new(any)) != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid tag."})
		return
	}

	tag, err := app.store.Create(r.Context(), input.Name, input.ParentID)
	if err != nil {
		writeError(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, tag)
}

func (app handler) delete(w http.ResponseWriter, r *http.Request) {
	err := app.store.Delete(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var children *hasSubtags
	switch {
	case errors.Is(err, errInvalidName):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid tag name."})
	case errors.Is(err, errMissingParent):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Parent tag not found."})
	case errors.Is(err, ErrUnknownTag):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Tag not found."})
	case errors.Is(err, errDuplicateName):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "A tag with that name already exists under the same parent."})
	case errors.Is(err, errCatalogChanged):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "Tags changed. Try again."})
	case errors.Is(err, errCatalogFull):
		writeJSON(w, http.StatusConflict, map[string]string{"error": "The tag list is full."})
	case errors.As(err, &children):
		writeJSON(w, http.StatusConflict, map[string]string{"error": children.name + " can’t be deleted because it has subtags."})
	default:
		slog.ErrorContext(r.Context(), "tags request", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Could not complete the tag request."})
	}
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
