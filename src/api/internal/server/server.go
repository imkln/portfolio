package server

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"net/url"
	"strings"

	"github.com/imkln/portfolio/src/api/internal/auth"
	"github.com/imkln/portfolio/src/api/internal/collections"
	"github.com/imkln/portfolio/src/api/internal/photos"
)

func New(
	ctx context.Context,
	config auth.Config,
	assets fs.FS,
	collectionStore collections.Store,
	photoStore photos.Store,
	photoFiles photos.FileStore,
	uploadOrigin string,
) (http.Handler, error) {
	if collectionStore == nil {
		return nil, errors.New("a collections store is required")
	}

	if photoStore == nil {
		return nil, errors.New("a photos store is required")
	}

	if photoFiles == nil {
		return nil, errors.New("a photo file store is required")
	}

	target, err := url.Parse(uploadOrigin)
	if err != nil || target.Scheme != "https" || target.Hostname() == "" || uploadOrigin != "https://"+target.Host {
		return nil, errors.New("a valid HTTPS photo upload origin is required")
	}

	index, err := fs.ReadFile(assets, "index.html")
	if err != nil {
		return nil, fmt.Errorf("read frontend build: %w", err)
	}

	sessions, err := auth.New(ctx, config)
	if err != nil {
		return nil, err
	}

	protection := http.NewCrossOriginProtection()
	if err := protection.AddTrustedOrigin(strings.TrimRight(config.Origin, "/")); err != nil {
		return nil, fmt.Errorf("set trusted origin: %w", err)
	}

	page := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(index)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /{$}", page)
	mux.HandleFunc("GET /photos", page)
	mux.HandleFunc("GET /collections/{id}", page)
	mux.Handle("GET /assets/", http.FileServerFS(assets))
	sessions.Register(mux)
	collections.Register(mux, collectionStore, sessions.IsOwner, photoFiles.ThumbnailURL)
	photos.Register(mux, photoStore, photoFiles, sessions.IsOwner)

	return securityHeaders(protection.Handler(mux), strings.TrimRight(config.AuthDomain, "/"), uploadOrigin), nil
}

func securityHeaders(next http.Handler, authDomain, uploadOrigin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: "+uploadOrigin+"; connect-src 'self' "+uploadOrigin+"; frame-ancestors 'none'; base-uri 'none'; form-action 'self' "+authDomain)

		next.ServeHTTP(w, r)
	})
}
