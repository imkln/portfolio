package auth_test

import (
	"net/http"
	"slices"
	"testing"

	"github.com/imkln/portfolio/src/backend/internal/api/testutils"
)

func TestOwnerGetsSession(t *testing.T) {
	fixture := testutils.NewAuth(t, testutils.OwnerEmail)

	cookie := fixture.SignIn(t)
	response := testutils.Request(fixture.Mux, http.MethodGet, "/api/session", "", cookie)

	testutils.CheckStatus(t, response, http.StatusOK)
}

func TestNonOwnerDoesNotGetSession(t *testing.T) {
	fixture := testutils.NewAuth(t, testutils.NonOwnerEmail)

	response := fixture.Callback(t)

	testutils.CheckStatus(t, response, http.StatusSeeOther)
	if response.Header().Get("Location") != "/" {
		t.Fatalf("sign-in should return to Home, got %s", response.Header().Get("Location"))
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.MaxAge >= 0 {
			t.Fatalf("non-owner received a cookie: %s", cookie.Name)
		}
	}
}

func TestSignInRejectsMismatchedState(t *testing.T) {
	fixture := testutils.NewAuth(t, testutils.OwnerEmail)
	login := testutils.Request(fixture.Mux, http.MethodGet, "/auth/login", "")
	testutils.CheckStatus(t, login, http.StatusSeeOther)

	response := testutils.Request(fixture.Mux, http.MethodGet,
		"/auth/callback?code=test-code&state=wrong", "", login.Result().Cookies()...)

	testutils.CheckStatus(t, response, http.StatusBadRequest)
}

func TestSigningOutClearsSessionCookie(t *testing.T) {
	fixture := testutils.NewAuth(t, testutils.OwnerEmail)
	session := fixture.SignIn(t)

	response := testutils.Request(fixture.Mux, http.MethodPost, "/auth/logout", "", session)

	testutils.CheckStatus(t, response, http.StatusSeeOther)
	if !slices.ContainsFunc(response.Result().Cookies(), func(cookie *http.Cookie) bool {
		return cookie.Name == session.Name && cookie.MaxAge < 0
	}) {
		t.Fatal("sign-out did not clear the session cookie")
	}
}
