package collections

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/dto"
	"github.com/imkln/portfolio/src/backend/internal/api/utils"
	"github.com/imkln/portfolio/src/backend/internal/domain/collections"
	"github.com/imkln/portfolio/src/backend/internal/domain/photos"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
)

type Handler struct {
	store       usecase.CollectionStore
	collections usecase.Collections

	signDownloadURL func(context.Context, string) (string, error)
}

func NewHandler(store usecase.CollectionStore, signDownloadURL func(context.Context, string) (string, error)) *Handler {
	return &Handler{store: store, collections: usecase.NewCollections(store), signDownloadURL: signDownloadURL}
}

func (app *Handler) ListCollections(w http.ResponseWriter, r *http.Request) {
	list, err := app.store.Load(r.Context())
	if err != nil {
		slog.ErrorContext(r.Context(), "read collections", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
		return
	}

	collections := make([]dto.Collection, 0, len(list.Collections))
	for _, collection := range list.Collections {
		collections = append(collections, app.buildCollectionResponse(r.Context(), collection))
	}

	utils.WriteJSON(w, http.StatusOK, dto.CollectionList{Collections: collections})
}

func (app *Handler) ReplaceCollections(w http.ResponseWriter, r *http.Request) {
	var replacement collections.List
	if !utils.DecodeStrictJSON(w, r, collections.MaxBytes, &replacement) || !replacement.Valid() {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}

	err := app.collections.Replace(r.Context(), replacement)

	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, collections.ErrTooLarge):
		utils.WriteJSONError(w, http.StatusBadRequest)
	case errors.Is(err, collections.ErrConcurrentUpdate):
		utils.WriteJSONError(w, http.StatusConflict)
	default:
		slog.ErrorContext(r.Context(), "save collections", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
	}
}

func (app *Handler) GetCollection(w http.ResponseWriter, r *http.Request) {
	collection, collectionItems, err := app.collections.Get(r.Context(), r.PathValue("id"))
	if errors.Is(err, collections.ErrNotFound) {
		utils.WriteJSONError(w, http.StatusNotFound)
		return
	}
	if err != nil {
		slog.ErrorContext(r.Context(), "read collection", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
		return
	}

	items := make([]dto.CollectionItem, 0, len(collectionItems))
	for _, item := range collectionItems {
		items = append(items, dto.CollectionItem{
			CollectionItem: item,
			CoverPhotoURL:  app.signPhotoURLIfAvailable(r.Context(), item.CoverPhotoID),
		})
	}

	utils.WriteJSON(w, http.StatusOK, dto.CollectionDetail{
		Collection: app.buildCollectionResponse(r.Context(), collection),
		Items:      items,
	})
}

func (app *Handler) ReplaceCollectionItems(w http.ResponseWriter, r *http.Request) {
	var update dto.ReplaceCollectionItems
	if !utils.DecodeStrictJSON(w, r, collections.MaxBytes, &update) || !update.Items.Valid() {
		utils.WriteJSONError(w, http.StatusBadRequest)
		return
	}

	id := r.PathValue("id")
	err := app.collections.ReplaceItems(r.Context(), id, update.Items)

	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.Is(err, collections.ErrTooLarge):
		utils.WriteJSONError(w, http.StatusBadRequest)
	case errors.Is(err, collections.ErrNotFound):
		utils.WriteJSONError(w, http.StatusNotFound)
	case errors.Is(err, collections.ErrConcurrentUpdate):
		utils.WriteJSONError(w, http.StatusConflict)
	default:
		slog.ErrorContext(r.Context(), "save collections", "error", err)
		utils.WriteJSONError(w, http.StatusInternalServerError)
	}
}

func (app *Handler) buildCollectionResponse(ctx context.Context, collection collections.Collection) dto.Collection {
	collection.Items = nil
	return dto.Collection{
		Collection:    collection,
		CoverPhotoURL: app.signPhotoURLIfAvailable(ctx, collection.CoverPhotoID),
	}
}

func (app *Handler) signPhotoURLIfAvailable(ctx context.Context, id *string) string {
	if id == nil || !photos.ValidID(*id) {
		return ""
	}

	url, err := app.signDownloadURL(ctx, *id)
	if err != nil {
		slog.ErrorContext(ctx, "sign photo download URL", "error", err)
		return ""
	}
	return url
}
