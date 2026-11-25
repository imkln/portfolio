package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/gorilla/sessions"
	"golang.org/x/oauth2"
)

type Sessions struct {
	config         Config
	oauth          oauth2.Config
	verifier       *oidc.IDTokenVerifier
	loginCookies   *sessions.CookieStore
	sessionCookies *sessions.CookieStore
}

func New(ctx context.Context, config Config) (*Sessions, error) {
	if err := config.Validate(); err != nil {
		return nil, err
	}

	config.Origin = strings.TrimRight(config.Origin, "/")
	config.AuthDomain = strings.TrimRight(config.AuthDomain, "/")

	ctx = oidc.ClientContext(ctx, &http.Client{Timeout: 10 * time.Second})
	provider, err := oidc.NewProvider(ctx, config.Issuer)
	if err != nil {
		return nil, fmt.Errorf("discover identity provider: %w", err)
	}

	secure := strings.HasPrefix(config.Origin, "https://")
	loginCookies, err := newCookieStore(config.CookieKey, secure, 10*60)
	if err != nil {
		return nil, err
	}

	sessionCookies, err := newCookieStore(config.CookieKey, secure, 60*60)
	if err != nil {
		return nil, err
	}

	endpoint := provider.Endpoint()
	endpoint.AuthStyle = oauth2.AuthStyleInParams

	return &Sessions{
		config: config,
		oauth: oauth2.Config{
			ClientID:    config.ClientID,
			Endpoint:    endpoint,
			RedirectURL: config.Origin + "/auth/callback",
			Scopes:      []string{oidc.ScopeOpenID, "email", "profile"},
		},
		verifier: provider.Verifier(&oidc.Config{
			ClientID:             config.ClientID,
			SupportedSigningAlgs: []string{oidc.RS256},
		}),
		loginCookies:   loginCookies,
		sessionCookies: sessionCookies,
	}, nil
}

type identityClaims struct {
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	TokenUse      string `json:"token_use"`
	Identities    []struct {
		Provider string `json:"providerName"`
	} `json:"identities"`
}

func (app *Sessions) verifyIdentity(ctx context.Context, rawToken string) (*oidc.IDToken, error) {
	var claims identityClaims
	token, err := app.verifier.Verify(ctx, rawToken)
	if err != nil {
		return nil, err
	}

	if err := token.Claims(&claims); err != nil {
		return nil, err
	}

	if token.Subject == "" || claims.TokenUse != "id" || !claims.EmailVerified || !strings.EqualFold(claims.Email, app.config.OwnerEmail) {
		return nil, errors.New("identity is not authorized")
	}

	if app.config.OwnerSubject != "" && token.Subject != app.config.OwnerSubject {
		return nil, errors.New("subject is not authorized")
	}

	for _, identity := range claims.Identities {
		if identity.Provider == "Google" {
			return token, nil
		}
	}

	return nil, errors.New("a Google identity is required")
}

func (app *Sessions) IsOwner(r *http.Request) bool {
	session, err := app.sessionCookies.Get(r, sessionCookie)
	if err != nil || session.IsNew {
		return false
	}

	token, ok := session.Values["token"].(string)
	if !ok || token == "" {
		return false
	}

	_, err = app.verifyIdentity(r.Context(), token)
	return err == nil
}
