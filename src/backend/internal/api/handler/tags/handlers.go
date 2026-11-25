package tags

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/dto"
	"github.com/imkln/portfolio/src/backend/internal/api/utils"
	tagmodel "github.com/imkln/portfolio/src/backend/internal/domain/tags"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
)

func NewHandler(store usecase.TagStore) *Handler {
	return &Handler{store: store, tags: usecase.NewTags(store)}
}

type Handler struct {
	store usecase.TagStore
	tags  usecase.Tags
}

func (app Handler) ListTags(w http.ResponseWriter, r *http.Request) {
	tags, err := app.store.List(r.Context())
	if err != nil {
		writeTagError(w, r, err)
		return
	}

	if tags == nil {
		tags = []tagmodel.Tag{}
	}

	utils.WriteJSON(w, http.StatusOK, tags)
}

func (app Handler) CreateTag(w http.ResponseWriter, r *http.Request) {
	var input dto.CreateTagRequest
	if !utils.DecodeJSON(w, r, 4096, &input) {
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid tag."})
		return
	}

	tag, err := app.tags.Create(r.Context(), input.Name, input.ParentID)
	if err != nil {
		writeTagError(w, r, err)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, tag)
}

func (app Handler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	err := app.tags.Delete(r.Context(), r.PathValue("id"))
	if err != nil {
		writeTagError(w, r, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeTagError(w http.ResponseWriter, r *http.Request, err error) {
	var children *tagmodel.HasSubtags
	switch {
	case errors.Is(err, tagmodel.ErrInvalidName):
		utils.WriteJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid tag name."})
	case errors.Is(err, tagmodel.ErrMissingParent):
		utils.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Parent tag not found."})
	case errors.Is(err, tagmodel.ErrUnknownTag):
		utils.WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Tag not found."})
	case errors.Is(err, tagmodel.ErrDuplicateName):
		utils.WriteJSON(w, http.StatusConflict, map[string]string{"error": "A tag with that name already exists under the same parent."})
	case errors.Is(err, tagmodel.ErrCatalogChanged):
		utils.WriteJSON(w, http.StatusConflict, map[string]string{"error": "Tags changed. Try again."})
	case errors.Is(err, tagmodel.ErrCatalogFull):
		utils.WriteJSON(w, http.StatusConflict, map[string]string{"error": "The tag list is full."})
	case errors.As(err, &children):
		utils.WriteJSON(w, http.StatusConflict, map[string]string{"error": children.Name + " can’t be deleted because it has subtags."})
	default:
		slog.ErrorContext(r.Context(), "tags request", "error", err)
		utils.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": "Could not complete the tag request."})
	}
}
