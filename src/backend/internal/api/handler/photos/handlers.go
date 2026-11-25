package photos

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"

	"github.com/imkln/portfolio/src/backend/internal/api/dto"
	"github.com/imkln/portfolio/src/backend/internal/api/utils"
	photostore "github.com/imkln/portfolio/src/backend/internal/domain/photos"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
)

const maxUploadRequest = 4 << 10

type Handler struct {
	store  usecase.PhotoStore
	photos usecase.Photos
	files  usecase.FileStore
}

func NewHandler(store usecase.PhotoStore, files usecase.FileStore, catalog usecase.TagCatalog) *Handler {
	return &Handler{store: store, photos: usecase.NewPhotos(store, catalog), files: files}
}

func (app *Handler) ListPhotos(w http.ResponseWriter, r *http.Request) {
	params, err := url.ParseQuery(r.URL.RawQuery)
	if err != nil {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}

	var token string
	if tokens, exists := params["pageToken"]; exists {
		if len(tokens) != 1 || tokens[0] == "" {
			utils.WriteJSONError(w, http.StatusBadRequest)
			return
		}
		token = tokens[0]
	}

	filters := params["tagId"]
	if !photostore.UniqueIDs(filters) {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}

	items, next, err := app.photos.List(r.Context(), token, filters)
	if errors.Is(err, photostore.ErrInvalidPageToken) {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "list photos", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []photostore.Photo{}
	}

	utils.WriteJSON(w, http.StatusOK, dto.PhotoPage{
		Photos:        items,
		NextPageToken: next,
	})
}

func (app *Handler) CreateUpload(w http.ResponseWriter, r *http.Request) {
	var file dto.PhotoUploadRequest
	if !utils.DecodeStrictJSON(w, r, maxUploadRequest, &file) || !file.Valid() {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}

	form, err := app.files.SignUpload(r.Context(), file.Name, file.Size)
	if err != nil {
		slog.ErrorContext(r.Context(), "sign photo upload", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
		return
	}

	utils.WriteJSON(w, http.StatusCreated, form)
}

func (app *Handler) RedirectToPhoto(readURL func(context.Context, string) (string, error)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if !photostore.ValidID(id) {
			utils.WriteJSONError(w, http.StatusNotFound)
			return
		}

		ready, err := app.store.IsReady(r.Context(), id)
		if err != nil {
			slog.ErrorContext(r.Context(), "read photo state", "error", err)
			utils.WriteJSONError(w, http.StatusInternalServerError)
			return
		}
		if !ready {
			utils.WriteJSONError(w, http.StatusNotFound)
			return
		}

		location, err := readURL(r.Context(), id)
		if err != nil {
			slog.ErrorContext(r.Context(), "sign photo download", "error", err)
			utils.WriteJSONError(w, http.StatusInternalServerError)
			return
		}

		http.Redirect(w, r, location, http.StatusTemporaryRedirect)
	}
}

func (app *Handler) DeletePhoto(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !photostore.ValidID(id) {
		utils.WriteJSONError(w, http.StatusNotFound)
		return
	}

	ctx := r.Context()
	found, err := app.photos.Delete(ctx, app.files, id)
	if err != nil {
		slog.ErrorContext(ctx, "delete photo", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
		return
	}
	if !found {
		utils.WriteJSONError(w, http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
