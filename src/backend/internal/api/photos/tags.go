package photos

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"slices"

	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"github.com/imkln/portfolio/src/backend/internal/api/tags"
	photostore "github.com/imkln/portfolio/src/backend/internal/shared/photos"
)

func (app *handler) editTags(w http.ResponseWriter, r *http.Request) {
	if !app.isOwner(r) {
		writeError(w, http.StatusUnauthorized)
		return
	}

	var edit struct {
		PhotoIDs     []string `json:"photoIds"`
		AddTagIDs    []string `json:"addTagIds"`
		RemoveTagIDs []string `json:"removeTagIds"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if err := decoder.Decode(&edit); err != nil || decoder.Decode(new(any)) != io.EOF ||
		len(edit.PhotoIDs) == 0 || len(edit.PhotoIDs) > photostore.MaxTagEditPhotos ||
		len(edit.AddTagIDs)+len(edit.RemoveTagIDs) == 0 ||
		!uniqueIDs(edit.PhotoIDs) || !uniqueIDs(append(slices.Clone(edit.AddTagIDs), edit.RemoveTagIDs...)) {
		writeError(w, http.StatusBadRequest)
		return
	}

	var catalog *types.ConditionCheck
	if len(edit.AddTagIDs) > 0 {
		var err error
		catalog, err = app.catalog.CheckAssignment(r.Context(), edit.AddTagIDs)
		if errors.Is(err, tags.ErrUnknownTag) {
			writeError(w, http.StatusNotFound)
			return
		}
		if err != nil {
			slog.ErrorContext(r.Context(), "load tags for photo edit", "error", err)
			writeError(w, http.StatusInternalServerError)
			return
		}
	}

	err := app.store.EditTags(r.Context(), edit.PhotoIDs, edit.AddTagIDs, edit.RemoveTagIDs, catalog)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, photostore.ErrPhotoNotFound):
		writeError(w, http.StatusNotFound)
	case errors.Is(err, photostore.ErrTagsChanged):
		writeError(w, http.StatusConflict)
	default:
		slog.ErrorContext(r.Context(), "edit photo tags", "error", err)
		writeError(w, http.StatusInternalServerError)
	}
}

func uniqueIDs(ids []string) bool {
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if !photostore.ValidID(id) || seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}
