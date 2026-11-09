package auth_test

import (
	"net/http"
	"testing"

	"github.com/imkln/portfolio/src/api/internal/testutils"
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
