package testutils

import (
	"crypto/rand"
	"crypto/rsa"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/go-jose/go-jose/v4/jwt"
	"github.com/imkln/portfolio/src/backend/internal/api/auth"
)

const (
	OwnerEmail    = "owner@example.test"
	NonOwnerEmail = "reader@example.test"
)

type Auth struct {
	Mux      *http.ServeMux
	Sessions *auth.Sessions
	nonce    atomic.Value
}

func NewAuth(t *testing.T, email string) *Auth {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithHeader("kid", "test"))
	if err != nil {
		t.Fatal(err)
	}

	fixture := &Auth{}
	provider := http.NewServeMux()
	provider.HandleFunc("GET /.well-known/openid-configuration", func(w http.ResponseWriter, r *http.Request) {
		issuer := "http://" + r.Host
		WriteJSON(t, w, map[string]any{
			"issuer":                 issuer,
			"authorization_endpoint": issuer + "/authorize",
			"token_endpoint":         issuer + "/token",
			"jwks_uri":               issuer + "/keys",
		})
	})
	provider.HandleFunc("GET /keys", func(w http.ResponseWriter, r *http.Request) {
		WriteJSON(t, w, jose.JSONWebKeySet{Keys: []jose.JSONWebKey{
			{Key: &key.PublicKey, KeyID: "test", Algorithm: "RS256", Use: "sig"},
		}})
	})
	provider.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		token, err := jwt.Signed(signer).Claims(map[string]any{
			"iss":            "http://" + r.Host,
			"aud":            "test-client",
			"sub":            "test-subject",
			"exp":            time.Now().Add(time.Hour).Unix(),
			"nonce":          fixture.nonce.Load(),
			"email":          email,
			"email_verified": true,
			"token_use":      "id",
			"identities":     []map[string]string{{"providerName": "Google"}},
		}).Serialize()
		if err != nil {
			t.Errorf("sign test token: %v", err)
			http.Error(w, "test token error", http.StatusInternalServerError)
			return
		}

		WriteJSON(t, w, map[string]any{"access_token": "test-token", "token_type": "Bearer", "id_token": token})
	})

	issuer := httptest.NewServer(provider)
	t.Cleanup(issuer.Close)
	config := auth.Config{
		Origin:     Origin,
		Issuer:     issuer.URL,
		AuthDomain: issuer.URL,
		ClientID:   "test-client",
		OwnerEmail: OwnerEmail,
		CookieKey:  strings.Repeat("ab", 32),
	}

	fixture.Sessions, err = auth.New(t.Context(), config)
	if err != nil {
		t.Fatal(err)
	}

	fixture.Mux = http.NewServeMux()
	fixture.Sessions.Register(fixture.Mux)
	return fixture
}

func (fixture *Auth) Callback(t *testing.T) *httptest.ResponseRecorder {
	t.Helper()

	login := Request(fixture.Mux, http.MethodGet, "/auth/login", "")
	CheckStatus(t, login, http.StatusSeeOther)
	location, err := url.Parse(login.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	params := location.Query()
	fixture.nonce.Store(params.Get("nonce"))

	callback := "/auth/callback?code=test-code&state=" + url.QueryEscape(params.Get("state"))
	return Request(fixture.Mux, http.MethodGet, callback, "", login.Result().Cookies()...)
}

func (fixture *Auth) SignIn(t *testing.T) *http.Cookie {
	t.Helper()

	response := fixture.Callback(t)
	CheckStatus(t, response, http.StatusSeeOther)
	for _, cookie := range response.Result().Cookies() {
		if cookie.MaxAge > 0 {
			return cookie
		}
	}
	t.Fatal("owner did not receive a session")
	return nil
}
