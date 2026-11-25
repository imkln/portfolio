package router

import (
	"context"
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/handler/collections"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
)

func Collections(mux *http.ServeMux, store usecase.CollectionStore, isOwner func(*http.Request) bool, signDownloadURL func(context.Context, string) (string, error)) {
	app := collections.NewHandler(store, signDownloadURL)

	mux.HandleFunc("GET /api/collections", app.ListCollections)
	mux.HandleFunc("PUT /api/collections", requireOwner(isOwner, app.ReplaceCollections))
	mux.HandleFunc("GET /api/collections/{id}", app.GetCollection)
	mux.HandleFunc("PATCH /api/collections/{id}", requireOwner(isOwner, app.ReplaceCollectionItems))
}
