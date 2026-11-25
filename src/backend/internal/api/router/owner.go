package router

import (
	"net/http"

	"github.com/imkln/portfolio/src/backend/internal/api/utils"
)

func requireOwner(isOwner func(*http.Request) bool, handle http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !isOwner(r) {
			utils.WriteJSONError(w, http.StatusUnauthorized)
			return
		}

		handle(w, r)
	}
}
