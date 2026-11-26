package router

import (
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/handler/photos"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
)

func Photos(mux *http.ServeMux, store usecase.PhotoStore, files usecase.FileStore, catalog usecase.TagCatalog, isOwner func(*http.Request) bool) {
	app := photos.NewHandler(store, files, catalog)
	mux.HandleFunc("GET /api/photos", requireOwner(isOwner, app.ListPhotos))
	mux.HandleFunc("POST /api/photos", requireOwner(isOwner, app.CreateUpload))
	mux.HandleFunc("PATCH /api/photos", requireOwner(isOwner, app.EditTags))
	mux.HandleFunc("GET /api/photos/{id}", requireOwner(isOwner, app.RedirectToPhoto(files.OriginalURL)))
	mux.HandleFunc("GET /api/photos/{id}/thumbnail", requireOwner(isOwner, app.RedirectToPhoto(files.ThumbnailURL)))
	mux.HandleFunc("DELETE /api/photos/{id}", requireOwner(isOwner, app.DeletePhoto))
}
