package photos

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/dto"
	"github.com/imkln/portfolio/src/backend/internal/api/utils"
	photostore "github.com/imkln/portfolio/src/backend/internal/domain/photos"
	"github.com/imkln/portfolio/src/backend/internal/domain/tags"
)

func (app *Handler) EditTags(w http.ResponseWriter, r *http.Request) {
	var edit dto.PhotoTagEdit
	if !utils.DecodeJSON(w, r, 64<<10, &edit) || !edit.Valid() {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}

	err := app.photos.AssignTags(r.Context(), edit.PhotoIDs, edit.AddTagIDs, edit.RemoveTagIDs)
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, photostore.ErrPhotoNotFound), errors.Is(err, tags.ErrUnknownTag):
		utils.WriteJSONError(w, http.StatusNotFound)
	case errors.Is(err, photostore.ErrTagsChanged):
		utils.WriteJSONError(w, http.StatusConflict)
	default:
		slog.ErrorContext(r.Context(), "edit photo tags", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
	}
}
