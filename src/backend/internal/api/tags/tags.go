package tags

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"unicode"
)

type Tag struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ParentID string `json:"parentId,omitempty"`
}

type Store interface {
	Load(context.Context) ([]Tag, error)
	Update(context.Context, func(*[]Tag) error) error
}

type problem struct {
	status  int
	message string
}

func (p *problem) Error() string { return p.message }

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
	tags, err := app.store.Load(r.Context())
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
		writeError(w, r, &problem{http.StatusBadRequest, "Invalid tag."})
		return
	}

	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 90 || strings.ContainsAny(name, "›>") || strings.ContainsFunc(name, unicode.IsControl) {
		writeError(w, r, &problem{http.StatusBadRequest, "Invalid tag name."})
		return
	}

	tag := Tag{ID: rand.Text(), Name: name, ParentID: input.ParentID}
	err := app.store.Update(r.Context(), func(tags *[]Tag) error {
		if tag.ParentID != "" && tagIndex(*tags, tag.ParentID) == -1 {
			return &problem{http.StatusNotFound, "Parent tag not found."}
		}

		for _, existing := range *tags {
			if existing.ParentID == tag.ParentID && strings.EqualFold(existing.Name, tag.Name) {
				return &problem{http.StatusConflict, "A tag with that name already exists under the same parent."}
			}
		}

		*tags = append(*tags, tag)
		return nil
	})
	if err != nil {
		writeError(w, r, err)
		return
	}

	writeJSON(w, http.StatusCreated, tag)
}

func (app handler) delete(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	err := app.store.Update(r.Context(), func(tags *[]Tag) error {
		index := tagIndex(*tags, id)
		if index == -1 {
			return &problem{http.StatusNotFound, "Tag not found."}
		}

		for _, tag := range *tags {
			if tag.ParentID == id {
				return &problem{http.StatusConflict, (*tags)[index].Name + " can’t be deleted because it has subtags."}
			}
		}

		*tags = slices.Delete(*tags, index, index+1)
		return nil
	})
	if err != nil {
		writeError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func tagIndex(tags []Tag, id string) int {
	return slices.IndexFunc(tags, func(tag Tag) bool { return tag.ID == id })
}

func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var issue *problem
	if errors.As(err, &issue) {
		writeJSON(w, issue.status, map[string]string{"error": issue.message})
		return
	}

	slog.ErrorContext(r.Context(), "tags request", "error", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Could not complete the tag request."})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(value)
}
