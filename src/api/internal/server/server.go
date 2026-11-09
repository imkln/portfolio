package server

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"strings"

	"github.com/imkln/portfolio/src/api/internal/auth"
	"github.com/imkln/portfolio/src/api/internal/collections"
	"github.com/imkln/portfolio/src/api/internal/photos"
)

func New(ctx context.Context, config auth.Config, assets fs.FS, collectionStore collections.Store, photoStore photos.Store) (http.Handler, error) {
	if collectionStore == nil {
		return nil, errors.New("a collections store is required")
	}

	if photoStore == nil {
		return nil, errors.New("a photos store is required")
	}

	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		return nil, fmt.Errorf("read frontend build: %w", err)
	}

	sessions, err := auth.New(ctx, config)
	if err != nil {
		return nil, err
	}

	page := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(index)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", page)
	mux.HandleFunc("GET /collections/{id}", page)
	mux.Handle("GET /assets/", http.FileServerFS(assets))
	sessions.Register(mux)
	collections.Register(mux, collectionStore, strings.TrimRight(config.Origin, "/"), sessions.IsOwner)

	photos.Register(mux, photoStore, sessions.IsOwner)

	return securityHeaders(mux, strings.TrimRight(config.AuthDomain, "/")), nil
}

func securityHeaders(next http.Handler, authDomain string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' "+authDomain)

		next.ServeHTTP(w, r)
	})
}
