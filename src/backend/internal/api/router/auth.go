package router

import (
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/handler/auth"
)

func Auth(mux *http.ServeMux, app *auth.Sessions) {
	mux.HandleFunc("GET /auth/login", app.Login)
	mux.HandleFunc("GET /auth/callback", app.Callback)
	mux.HandleFunc("POST /auth/logout", app.Logout)
	mux.HandleFunc("GET /api/session", app.Session)
}
