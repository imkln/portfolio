package router

import (
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/handler/tags"
	"github.com/imkln/portfolio/src/backend/internal/usecase"
)

func Tags(mux *http.ServeMux, store usecase.TagStore, isOwner func(*http.Request) bool) {
	app := tags.NewHandler(store)
	mux.HandleFunc("GET /api/tags", requireOwner(isOwner, app.ListTags))
	mux.HandleFunc("POST /api/tags", requireOwner(isOwner, app.CreateTag))
	mux.HandleFunc("DELETE /api/tags/{id}", requireOwner(isOwner, app.DeleteTag))
}
